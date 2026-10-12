// Reading sessions, departments and courses. Owner: Track S -- S4 (#21).
//
// SERVER ONLY. The real bodies read Supabase through the cookie-bound client
// in @/lib/supabase/server, so RLS applies as the signed-in user. `import
// "server-only"` makes importing this from a Client Component a build error
// rather than a confusing runtime one. (Next.js resolves "server-only" itself
// -- the npm package is optional and not installed; vitest.config.mts maps it
// to an empty module so tests can import this file. The stub logic lives in
// fixtures.ts, where it is tested.)
//
// Client code that needs these TYPES may `import type` them: type imports are
// erased before bundling. Client code that needs the DATA gets it one of two
// ways:
//   - from a Server Component, as props (listSessions, listDepartments);
//   - searchCourses only: through GET /api/courses, via
//     fetchCourseSuggestions() in @/lib/course-search. Why a Route Handler and
//     not a Server Function: see src/app/api/courses/route.ts.
//
// Every function below is a W4 stub (#11) returning fixtures. S4 replaces the
// bodies and keeps the signatures -- see docs/contracts.md.

import "server-only";

import {
  fixtureCourseSuggestions,
  fixtureDepartments,
  fixtureSessionList,
} from "@/lib/fixtures";

// ---------------------------------------------------------------------------
// Types -- what the UI reads. Deliberately not database rows: camelCase,
// joined, and with the derived fields already derived.
// ---------------------------------------------------------------------------

/** A course as a session card shows it: `CS 3251 · Intermediate Software Design`. */
export type CourseLabel = {
  /** `departments.code`, normalised: `CS` */
  departmentCode: string;
  /** `courses.number`, normalised: `3251`, `1601L` */
  number: string;
  /** Crowdsourced and optional (ADR 0006): render without it when null. */
  title: string | null;
};

/**
 * One card in the session list (US-03). Everything W5's card needs, and
 * nothing it does not -- no host id, no roster, no coordinates.
 */
export type SessionListItem = {
  /** `sessions.id` -- for the link to /sessions/[id] (a later sprint). */
  id: string;
  course: CourseLabel;
  topic: string;
  /** The host's own label, prefilled from Places (ADR 0008 rule 14). */
  locationLabel: string;
  /** Null when the host left it blank -- normal for a cafe. */
  room: string | null;
  /**
   * ISO 8601 in UTC (`2026-10-01T19:30:00.000Z`), as Supabase returns
   * `timestamptz`. FORMAT WITH AN EXPLICIT TIME ZONE: a Server Component on
   * Vercel runs in UTC, so `toLocaleTimeString()` there is five or six hours
   * off. Use `timeZone: "America/Chicago"`, or format in a Client Component.
   */
  startsAt: string;
  /** ISO 8601 in UTC, like `startsAt`. */
  endsAt: string;
  /** Seats in total, the host's included. At least 2. */
  capacity: number;
  /** People on the roster, the host included -- so never less than 1. */
  attendeeCount: number;
  /**
   * `capacity - attendeeCount`, floored at 0. **0 means full** -- give it the
   * "Full" treatment. Derived from the roster, never stored (ADR 0008 rule 9).
   */
  seatsLeft: number;
  /** The host's display name; null if they deleted their account ("Deleted user"). */
  hostDisplayName: string | null;
};

/** A department for the create-session department picker. */
export type Department = {
  /** Normalised code, `CS`. What the form submits as `departmentCode`. */
  code: string;
  /** Null for departments students added without a name (ADR 0008). */
  name: string | null;
};

/** A typeahead suggestion for the course-number field. */
export type CourseSuggestion = CourseLabel & {
  /** `courses.id` -- a stable React key. The form submits `number`, not this. */
  id: string;
  /**
   * How many sessions have used this course, ever. Suggestions arrive sorted
   * by it, most used first -- usage ranking is what floats the real course
   * above a typo'd duplicate (ADR 0008). The UI may show it ("12 sessions").
   */
  sessionCount: number;
};

/** The most suggestions searchCourses() returns. */
export const COURSE_SUGGESTION_LIMIT = 8;

// ===========================================================================
// STUB (W4, #11) -- replaced by S4 (#21). Keep the signature.
//
// Fixture sessions, filtered and derived the way the real query must be.
//
// The real body must:
//   - read sessions with their course, host display name and roster count,
//     through the cookie-bound client, so RLS applies (S1 adds the policies);
//   - exclude cancelled sessions (`status = 'cancelled'`) and ended ones
//     (`ends_at <= now()`, using the DATABASE's clock). In-progress sessions
//     stay in;
//   - derive attendeeCount from session_attendees -- never a stored counter
//     (ADR 0008 rule 9). If you use a view, create it `with
//     (security_invoker = true)`: a plain view bypasses RLS (ADR 0008, "Watch");
//   - order by starts_at ascending, soonest first;
//   - map a null host_id (deleted account) to hostDisplayName: null.
// ===========================================================================

/** Open sessions that have not ended, soonest first (US-03). */
export async function listSessions(): Promise<SessionListItem[]> {
  return fixtureSessionList(new Date());
}

// ===========================================================================
// STUB (W4, #11) -- replaced by S4 (#21). Keep the signature.
//
// The real body must read `departments` (S2 adds the read policy), leave out
// merged ones (`merged_into is not null`), and order by code.
// ===========================================================================

/** Every department a host can pick, ordered by code. */
export async function listDepartments(): Promise<Department[]> {
  return fixtureDepartments();
}

// ===========================================================================
// STUB (W4, #11) -- replaced by S4 (#21). Keep the signature.
//
// Matches fixture courses in the department whose number starts with the
// query, or whose title contains it. Counts come from the fixture sessions.
//
// The real body must:
//   - normalise both arguments with S2's (#19) normalisers first, so `cs`
//     finds `CS` and `3251w` finds `3251W`. This is untrusted input straight
//     from the Route Handler;
//   - leave out merged courses (`merged_into is not null`);
//   - count sessions per course (all of them, ended and cancelled included --
//     it is a measure of use) and order by that count, descending, then by
//     number;
//   - return at most COURSE_SUGGESTION_LIMIT rows;
//   - return [] for an unknown department, never throw for one: the host may
//     be about to add it.
// An empty query returns the department's most-used courses, for showing
// suggestions as soon as the field is focused.
// ===========================================================================

/**
 * Course suggestions for the typeahead, most used first. Called by
 * GET /api/courses -- client components use fetchCourseSuggestions().
 */
export async function searchCourses(
  departmentCode: string,
  query: string,
): Promise<CourseSuggestion[]> {
  return fixtureCourseSuggestions(departmentCode, query, COURSE_SUGGESTION_LIMIT);
}
