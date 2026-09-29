"use server";

// Server actions for study sessions. Owner: Track S.
//
// A "use server" file may export only async functions (and types, which are
// erased). Put constants and helpers elsewhere.
//
// Every action here is a public POST endpoint, reachable without the form
// (Next's "Server Actions" guide): authenticate, validate, and authorise
// inside the action every time.
//
// Later sprints, not stubbed yet: joinSession() (US-04), leaveSession()
// (US-08), cancelSession() (US-09, host only), sendMessage() (US-05).
// IMPORTANT for joinSession: it must not be a plain insert. The capacity check
// and the insert have to happen atomically, or two students take the same last
// seat -- route it through a database function holding a row lock (ADR 0008
// rule 11, architecture.md section 3).

import { redirect } from "next/navigation";

import { PlaceError, resolvePlace } from "@/lib/places";
import { requireUser } from "@/lib/supabase/server";
import {
  createSessionSchema,
  formValues,
  invalidFormState,
  type CreateSessionField,
  type FormState,
} from "@/lib/validation";

/**
 * What createSession() hands back to `useActionState` when it does not
 * redirect: per-field errors keyed by createSessionSchema's field names, a
 * form-level error, and the submitted values to refill the form with. Start
 * from `{}`.
 */
export type CreateSessionState = FormState<CreateSessionField>;

// ===========================================================================
// STUB (W4, #11) -- replaced by S3 (#20). Keep the signature.
//
// Validates for real and checks the place against the fixtures, then
// redirects to /sessions WITHOUT SAVING ANYTHING: the new session will not be
// in the list. That is expected until S3.
//
// The real body must, in this order:
//   1. requireUser() -- redirects signed-out and nameless users (A4, #17).
//   2. createSessionSchema().safeParse(Object.fromEntries(formData)) -- call
//      the factory per request so "now" is the request's. On failure return
//      invalidFormState(...).
//   3. resolvePlace(placeId) (M3, #24) -> locationId. A PlaceError becomes a
//      field error on `placeId`; anything else is unexpected -- let it throw.
//   4. Create-on-use: S2's (#19) function turns departmentCode + courseNumber
//      into a course id, creating the department or course if new.
//   5. Call S1's `create_session` database function, which inserts the
//      session and the host as an attendee in one transaction and rechecks
//      the rules (start not in the past, end after start, capacity >= 2,
//      display name set). host_id comes from the session cookie, never from
//      the form.
//   6. Map any database error through src/lib/errors.ts into `formError` (or
//      a field error). Never return raw Postgres text.
//   7. redirect("/sessions") -- OUTSIDE any try/catch: redirect() works by
//      throwing.
// ===========================================================================

/** Create a study session from the create-session form (US-02). */
export async function createSession(
  _prev: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  await requireUser();

  const parsed = createSessionSchema().safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  try {
    await resolvePlace(parsed.data.placeId);
  } catch (error) {
    if (error instanceof PlaceError) {
      return {
        fieldErrors: { placeId: [error.message] },
        values: formValues(formData),
      };
    }
    throw error;
  }

  redirect("/sessions");
}
