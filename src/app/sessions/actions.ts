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
// Later sprints, not stubbed yet: sendMessage() (US-05).
//
// R1 added requestSession() and withdrawRequest() (US-16) at the bottom --
// the only writes here that go through RLS policies rather than an RPC.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { databaseErrorMessage, type DatabaseErrorLike } from "@/lib/errors";
import { PlaceError, resolvePlace } from "@/lib/places";
import { getSession } from "@/lib/sessions";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  createSessionSchema,
  editSessionSchema,
  formValues,
  invalidFormState,
  studyRequestSchema,
  type CreateSessionField,
  type EditSessionField,
  type FormState,
  type StudyRequestField,
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
 * `requireUser()` (A4) redirects anyone signed out or without a display
 * name; both RPCs below check `auth.uid()` again for themselves. Without a
 * Maps key the picker offers only the fixture places, whose location ids are
 * rows in local and CI databases only (M5, #36): anywhere else
 * create_session fails its foreign key.
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
    // The picker's session token, if it sent one, ends Google's Autocomplete
    // session with this lookup (M2).
    ({ locationId } = await resolvePlace(parsed.data.placeId, {
      sessionToken: parsed.data.placeSessionToken,
    }));
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
    return databaseFailure("get_or_create_course", courseError, formData);
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
    // The generated types mark every function argument non-null; the
    // function itself turns a blank room back into null.
    room: parsed.data.room ?? "",
    topic: parsed.data.topic,
    starts_at: parsed.data.startsAt.toISOString(),
    ends_at: parsed.data.endsAt.toISOString(),
    capacity: parsed.data.capacity,
  });
  if (sessionError) {
    return databaseFailure("create_session", sessionError, formData);
  }

  redirect("/sessions");
}

/**
 * What editSession() hands back to `useActionState` when it does not
 * redirect. Same field names as creating a session -- the form and its rules
 * are the same (editSessionSchema). Start from `{}`.
 */
export type EditSessionState = FormState<EditSessionField>;

/**
 * Save a host's edits to their own session (US-09).
 *
 * Bind the session id: `useActionState(editSession.bind(null, sessionId), {})`.
 *
 * `requireUser()` redirects anyone signed out or without a display name, but
 * it says nothing about *this* session -- S7's update_session() is what
 * compares auth.uid() against the stored host_id, and it is the only thing
 * that can: there is no UPDATE policy on `sessions`. This action must never
 * update the table directly.
 *
 * The session's stored start time is read here, from the database, and handed
 * to editSessionSchema so an unmoved start that has already passed is still
 * accepted (a host fixing a typo mid-session). It is deliberately NOT taken
 * from the form: a client could otherwise claim any "unchanged" start and
 * talk this layer into accepting a past one. update_session() compares
 * against the stored value regardless, so this only keeps the message honest.
 */
export async function editSession(
  sessionId: string,
  _prev: EditSessionState,
  formData: FormData,
): Promise<EditSessionState> {
  await requireUser();

  const session = await getSession(sessionId);
  if (!session) {
    return { formError: databaseErrorMessage({ message: "session_not_found" }) };
  }

  const parsed = editSessionSchema(new Date(session.startsAt)).safeParse(
    Object.fromEntries(formData),
  );
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  let locationId: string;
  try {
    ({ locationId } = await resolvePlace(parsed.data.placeId));
  } catch (error) {
    if (error instanceof PlaceError) {
      return { fieldErrors: { placeId: [error.message] }, values: formValues(formData) };
    }
    throw error;
  }

  const supabase = await createClient();

  const { data: courseId, error: courseError } = await supabase.rpc("get_or_create_course", {
    p_department_code: parsed.data.departmentCode,
    p_course_number: parsed.data.courseNumber,
  });
  if (courseError) {
    return editFailure("get_or_create_course", courseError, formData);
  }

  const { error: updateError } = await supabase.rpc("update_session", {
    p_session_id: sessionId,
    p_course_id: courseId,
    p_location_id: locationId,
    p_location_label: parsed.data.locationLabel,
    // The generated types mark every argument non-null; the function turns a
    // blank room back into null, as create_session does.
    p_room: parsed.data.room ?? "",
    p_topic: parsed.data.topic,
    p_starts_at: parsed.data.startsAt.toISOString(),
    p_ends_at: parsed.data.endsAt.toISOString(),
    p_capacity: parsed.data.capacity,
  });
  if (updateError) {
    return editFailure("update_session", updateError, formData);
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  redirect(`/sessions/${sessionId}`);
}

/**
 * Cancel a session as its host (US-09). Same binding pattern as joinSession().
 *
 * Nothing is deleted: cancel_session() sets the status, so attendees holding
 * a link still see what happened, and listSessions() drops it. The host
 * cannot leave their own session (`host_cannot_leave`) -- this is what that
 * message points at.
 */
export async function cancelSession(
  sessionId: string,
  _prev: SessionActionState,
  _formData: FormData,
): Promise<SessionActionState> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_session", { p_session_id: sessionId });
  if (error) {
    console.error("cancelSession: cancel_session failed", {
      code: error.code,
      message: error.message,
    });
    return { error: databaseErrorMessage(error) };
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  return {};
}

/**
 * What joinSession()/leaveSession() hand back when they do not redirect --
 * there is nothing to refill, only a message for S6's roster to show beside
 * the button. Start from `{}`.
 */
export type SessionActionState = { error?: string };

/**
 * Join a session's roster (US-04). Bind the session id for a form action:
 * `useActionState(joinSession.bind(null, sessionId), {})`, same pattern Next
 * documents for passing extra arguments to a Server Action.
 *
 * `requireUser()` redirects anyone signed out or without a display name;
 * join_session (S5) rechecks auth.uid() itself regardless, and holds the row
 * lock that keeps two students from taking the same last seat
 * (architecture.md section 3, US-07b) -- this action must never insert into
 * session_attendees directly.
 */
export async function joinSession(
  sessionId: string,
  _prev: SessionActionState,
  _formData: FormData,
): Promise<SessionActionState> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_session", { session_id: sessionId });
  if (error) {
    console.error("joinSession: join_session failed", { code: error.code, message: error.message });
    return { error: databaseErrorMessage(error) };
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  return {};
}

/**
 * Leave a session's roster (US-08). Same binding pattern as joinSession().
 * The host cannot leave -- leave_session (S5) refuses them with
 * `host_cannot_leave`; they cancel instead (US-09, later).
 */
export async function leaveSession(
  sessionId: string,
  _prev: SessionActionState,
  _formData: FormData,
): Promise<SessionActionState> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_session", { session_id: sessionId });
  if (error) {
    console.error("leaveSession: leave_session failed", { code: error.code, message: error.message });
    return { error: databaseErrorMessage(error) };
  }

  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/sessions");
  return {};
}

// ---------------------------------------------------------------------------
// Study requests (US-16, R1).
//
// The only writes in this file that do NOT go through a SECURITY DEFINER
// function: study_requests is written through its INSERT and DELETE policies
// (see *_r1_study_requests.sql for why a function would buy nothing). So
// these two actions are the place where getting the author wrong would be an
// IDOR, and both lean on the policy rather than on their own check:
// `author_id` is sent as the caller's own id and the policy refuses anything
// else, and the delete names only a request id, with the policy restricting
// it to the caller's own rows.
// ---------------------------------------------------------------------------

/** What requestSession() hands back to `useActionState`. Start from `{}`. */
export type StudyRequestState = FormState<StudyRequestField>;

/**
 * Ask for a session in a course nobody is hosting (US-16).
 *
 * `requireUser()` first, as everywhere: it also means a student without a
 * display name is sent to the name step before asking, which matches hosting
 * (ADR 0008 rule 1) even though the request itself shows no name.
 *
 * Asking again REFRESHES rather than fails. The unique constraint allows one
 * live request per student per course, so a second ask would be a 23505; but
 * the thing a student means by asking again is "I still want this", and the
 * row they are colliding with may be a lapsed one from last week that
 * nothing sweeps up. Deleting their own row first -- which the DELETE policy
 * scopes to them -- turns that into a new 7 days. The two statements are not
 * atomic; the worst case is the delete landing and the insert not, which
 * leaves them where they started, free to ask again.
 */
export async function requestSession(
  _prev: StudyRequestState,
  formData: FormData,
): Promise<StudyRequestState> {
  const user = await requireUser();

  const parsed = studyRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  const supabase = await createClient();

  // The same create-on-use path the create-session form takes (S2), so a
  // request and a session for the same course land on one `courses` row.
  const { data: courseId, error: courseError } = await supabase.rpc("get_or_create_course", {
    p_department_code: parsed.data.departmentCode,
    p_course_number: parsed.data.courseNumber,
  });
  if (courseError) {
    return studyRequestFailure("get_or_create_course", courseError, formData);
  }

  await supabase
    .from("study_requests")
    .delete()
    .eq("course_id", courseId)
    .eq("author_id", user.id);

  const { error } = await supabase.from("study_requests").insert({
    course_id: courseId,
    // Pinned by study_requests_insert; sent here because the trigger
    // deliberately does not set it (see the migration).
    author_id: user.id,
    note: parsed.data.note,
  });
  if (error) {
    return studyRequestFailure("study_requests insert", error, formData);
  }

  // No redirect: the form lives on /sessions, and the answer the student
  // wants is their own ask appearing in the list with a Withdraw button.
  revalidatePath("/sessions");
  return {};
}

/**
 * Withdraw your own study request (US-16). Bound like joinSession:
 * `useActionState(withdrawRequest.bind(null, requestId), {})`.
 *
 * Asks for an exact count because RLS refuses SILENTLY: a delete aimed at
 * someone else's request is not an error, it simply matches no rows. Without
 * the count this would report success for a request it never touched.
 */
export async function withdrawRequest(
  requestId: string,
  _prev: SessionActionState,
  _formData: FormData,
): Promise<SessionActionState> {
  await requireUser();

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("study_requests")
    .delete({ count: "exact" })
    .eq("id", requestId);

  if (error) {
    console.error("withdrawRequest: delete failed", { code: error.code, message: error.message });
    return { error: databaseErrorMessage(error) };
  }
  if (count === 0) {
    return { error: "That request isn't there anymore." };
  }

  revalidatePath("/sessions");
  return {};
}

/** databaseFailure's twin for the study-request form's field names. */
function studyRequestFailure(
  what: string,
  error: DatabaseErrorLike,
  formData: FormData,
): StudyRequestState {
  console.error(`requestSession: ${what} failed`, { code: error.code, message: error.message });
  return { formError: databaseErrorMessage(error), values: formValues(formData) };
}

/**
 * The student sees our own message; the server log keeps Postgres's code
 * and text, so a generic "Something went wrong" can still be traced.
 */
function databaseFailure(
  rpc: string,
  error: DatabaseErrorLike,
  formData: FormData,
): CreateSessionState {
  console.error(`createSession: ${rpc} failed`, { code: error.code, message: error.message });
  return { formError: databaseErrorMessage(error), values: formValues(formData) };
}

/** The same, for editSession() (US-09). */
function editFailure(
  rpc: string,
  error: DatabaseErrorLike,
  formData: FormData,
): EditSessionState {
  console.error(`editSession: ${rpc} failed`, { code: error.code, message: error.message });
  return { formError: databaseErrorMessage(error), values: formValues(formData) };
}
