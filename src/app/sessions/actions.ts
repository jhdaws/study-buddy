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

import { mapDatabaseError } from "@/lib/errors";
import { PlaceError, resolvePlace } from "@/lib/places";
import { createClient, requireUser } from "@/lib/supabase/server";
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

/**
 * Create a study session from the create-session form (US-02).
 *
 * `requireUser()` is still W4's stub (A4, #17 replaces it): until real
 * sign-in lands, it returns FIXTURE_USER without establishing a genuine
 * Supabase session, so `auth.uid()` is null inside the RPC calls below and
 * both fail with "not_signed_in". That is expected -- this function is real,
 * but exercising it end to end needs Track A too.
 */
export async function createSession(
  _prev: CreateSessionState,
  formData: FormData,
): Promise<CreateSessionState> {
  await requireUser();

  const parsed = createSessionSchema().safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  let locationId: string;
  try {
    ({ locationId } = await resolvePlace(parsed.data.placeId));
  } catch (error) {
    if (error instanceof PlaceError) {
      return {
        fieldErrors: { placeId: [error.message] },
        values: formValues(formData),
      };
    }
    throw error;
  }

  const supabase = await createClient();

  // Create-on-use (S2, #19): turns departmentCode + courseNumber into a
  // course id, creating the department and/or course if neither exists yet.
  const { data: courseId, error: courseError } = await supabase.rpc(
    "get_or_create_course",
    {
      p_department_code: parsed.data.departmentCode,
      p_course_number: parsed.data.courseNumber,
    },
  );
  if (courseError) {
    return {
      formError: mapDatabaseError(courseError),
      values: formValues(formData),
    };
  }

  // S1's create_session: inserts the session and the host as an attendee in
  // one transaction, and rechecks the rules the form already applied (start
  // not in the past, end after start, capacity >= 2, display name set).
  // host_id comes from the session cookie inside the function -- never from
  // the form.
  const { error: sessionError } = await supabase.rpc("create_session", {
    course_id: courseId,
    location_id: locationId,
    location_label: parsed.data.locationLabel,
    room: parsed.data.room,
    topic: parsed.data.topic,
    starts_at: parsed.data.startsAt.toISOString(),
    ends_at: parsed.data.endsAt.toISOString(),
    capacity: parsed.data.capacity,
  });
  if (sessionError) {
    return {
      formError: mapDatabaseError(sessionError),
      values: formValues(formData),
    };
  }

  redirect("/sessions");
}
