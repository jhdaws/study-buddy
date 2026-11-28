"use server";

// Server action for reporting a user (US-18), or one of their chat messages.
// Owner: P3; message reports P5 (#156).
//
// A "use server" file may export only async functions (and types). This one
// is a public POST endpoint: it authenticates and validates every time. Who
// is reporting is never a form field -- the database fills reporter_id from
// the session (auth.uid()), and clients have no privilege to name it -- and
// RLS refuses a report about yourself (*_reports.sql). The checks here are
// for a good message; the database is the enforcement.
//
// Nothing about the reported student is read or returned: the form already
// has their display name from the roster, and the reply says only whether
// the report was sent.
//
// A MESSAGE REPORT (P5) carries a `messageId`. Then who is reported, and in
// which session, come from the message itself -- read here through the
// caller's own client, so RLS shows it only to someone on that session's
// roster -- never from the form's hidden fields. The database checks the
// same thing again (reports_insert_message_seen), so a direct API call
// cannot pin a message on someone who did not write it.

import { databaseErrorMessage, databaseErrorReason } from "@/lib/errors";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  formValues,
  invalidFormState,
  reportUserSchema,
  type FormState,
  type ReportUserField,
} from "@/lib/validation";

/** What reportUser() hands back. Start from `{}`; `sent` once it went through. */
export type ReportUserState = FormState<ReportUserField> & { sent?: boolean };

/**
 * Send a report about another student, or about one of their chat messages.
 * Form fields (reportUserSchema): `reportedUserId` and `sessionId` (hidden,
 * from the roster or the message), `messageId` (hidden, only for a message),
 * `reason`, and an optional `note`.
 */
export async function reportUser(
  _prev: ReportUserState,
  formData: FormData,
): Promise<ReportUserState> {
  const user = await requireUser();

  const parsed = reportUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  const supabase = await createClient();
  let target = { reportedUserId: parsed.data.reportedUserId, sessionId: parsed.data.sessionId };

  if (parsed.data.messageId) {
    const { data: message, error: readError } = await supabase
      .from("session_messages")
      .select("author_id, session_id")
      .eq("id", parsed.data.messageId)
      .maybeSingle();
    if (readError) {
      console.error("reportUser: reading the message failed", {
        code: readError.code,
        reason: databaseErrorReason(readError),
      });
      return { formError: databaseErrorMessage(readError), values: formValues(formData) };
    }
    // Not there, or not visible: no longer on the roster, or a forged id.
    if (!message) {
      return { formError: "That message isn't there anymore.", values: formValues(formData) };
    }
    if (message.author_id === null) {
      return {
        formError: "That message's author deleted their account, so there's no one to report.",
        values: formValues(formData),
      };
    }
    if (message.author_id === user.id) {
      return { formError: "You can't report your own message.", values: formValues(formData) };
    }
    target = { reportedUserId: message.author_id, sessionId: message.session_id };
  } else if (parsed.data.reportedUserId === user.id) {
    return { formError: "You can't report yourself.", values: formValues(formData) };
  }

  // No .select(): students cannot read reports, their own included, so the
  // insert must not ask for the row back.
  const { error } = await supabase.from("reports").insert({
    reported_user_id: target.reportedUserId,
    session_id: target.sessionId,
    // Only on a message report, so a user report is exactly what it was.
    ...(parsed.data.messageId ? { message_id: parsed.data.messageId } : {}),
    reason: parsed.data.reason,
    note: parsed.data.note,
  });
  if (error) {
    console.error("reportUser: insert failed", {
      code: error.code,
      message: error.message,
      aboutMessage: parsed.data.messageId !== null,
    });
    return { formError: databaseErrorMessage(error), values: formValues(formData) };
  }

  return { sent: true };
}
