"use server";

// Server action for reporting a user (US-18). Owner: P3.
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

import { databaseErrorMessage } from "@/lib/errors";
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
 * Send a report about another student. Form fields (reportUserSchema):
 * `reportedUserId` and `sessionId` (hidden, from the roster), `reason`, and
 * an optional `note`.
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
  if (parsed.data.reportedUserId === user.id) {
    return { formError: "You can't report yourself.", values: formValues(formData) };
  }

  const supabase = await createClient();
  // No .select(): students cannot read reports, their own included, so the
  // insert must not ask for the row back.
  const { error } = await supabase.from("reports").insert({
    reported_user_id: parsed.data.reportedUserId,
    session_id: parsed.data.sessionId,
    reason: parsed.data.reason,
    note: parsed.data.note,
  });
  if (error) {
    console.error("reportUser: insert failed", { code: error.code, message: error.message });
    return { formError: databaseErrorMessage(error), values: formValues(formData) };
  }

  return { sent: true };
}
