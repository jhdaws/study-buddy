// Maps database error codes onto messages a student should actually see.
//
// First real use: S3, mapping the errors create_session and
// get_or_create_course can raise (supabase/migrations/20261001031738 and
// ...031739). Each function either raises a short, stable message -- matched
// below by exact text -- or lets a CHECK constraint fail, which Postgres
// reports as a check_violation (23514) naming the constraint in its message
// -- matched by pulling that name out. Later: the join routine's errors
// (session full, cancelled, ended, not signed in), in a later sprint.
//
// Kept a pure function so the failure paths -- awkward to reproduce against a
// live database -- are cheap to unit test. Never surface raw Postgres text to
// a user.

/** The shape of a Supabase/PostgREST error -- only the fields this reads. */
export type DatabaseError = {
  message?: string | null;
  code?: string | null;
};

/** Exact messages raised by `raise exception '<message>'` in a migration. */
const RAISED_MESSAGES: Record<string, string> = {
  not_signed_in: "You've been signed out. Sign in again and try.",
  display_name_required: "Add a display name before hosting a session.",
  starts_in_past: "That start time has already passed.",
  department_required: "Choose or add a department.",
  invalid_course_number: "Enter a 4-digit course number, like 3251 or 2100W.",
};

/** CHECK constraints a violation can name, from the same migrations. */
const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
  sessions_ends_after_starts: "The session has to end after it starts.",
  sessions_capacity_min: "Capacity must be at least 2 — you count as one.",
  departments_code_normalised: "That department code isn't valid.",
  courses_number_normalised: "Enter a 4-digit course number, like 3251 or 2100W.",
};

/** check_violation. */
const PG_CHECK_VIOLATION = "23514";

/** A message a student should see for any error a session-creation RPC call returns. */
export function mapDatabaseError(error: DatabaseError): string {
  const message = error.message ?? "";

  const raised = RAISED_MESSAGES[message];
  if (raised) return raised;

  if (error.code === PG_CHECK_VIOLATION) {
    const constraint = /violates check constraint "([^"]+)"/.exec(message)?.[1];
    const mapped = constraint && CHECK_CONSTRAINT_MESSAGES[constraint];
    if (mapped) return mapped;
  }

  return "Something went wrong saving that. Try again.";
}
