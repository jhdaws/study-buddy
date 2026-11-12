// N1 · US-17: "new sessions in your courses". Owner: Tapan.
//
// SERVER ONLY, like sessions.ts and profiles.ts: reads go through the
// cookie-bound client, so they run as the signed-in student. All three calls
// are RPCs, not table reads -- `profiles.last_seen_sessions_at` has no
// SELECT or UPDATE grant at all (*_n1_new_in_your_courses.sql), so these
// three SECURITY DEFINER functions are the only way to read or advance it.
//
// Each function throws on a database error rather than answering a default,
// the way fetchDisplayName() does -- callers decide at the call site whether
// "nothing new" is an acceptable fallback (the nav badge) or the error should
// surface (the Home page's own section).

import "server-only";

import { createClient } from "@/lib/supabase/server";

/** One row of the Home page's "New in your courses" list. */
export type NewCourseSession = {
  id: string;
  topic: string;
  course: { departmentCode: string; number: string; title: string | null };
  /** ISO 8601 in UTC, like SessionListItem's. */
  startsAt: string;
  endsAt: string;
  locationLabel: string;
};

/**
 * How many open sessions in the student's courses are new since they last
 * checked. No side effect -- safe to call on every page's render, not only
 * Home or /sessions, for the nav badge.
 */
export async function countNewSessionsInMyCourses(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_new_sessions_in_my_courses");
  if (error) {
    throw new Error(`Could not count new sessions: ${error.message}`);
  }
  return data ?? 0;
}

/**
 * The Home page's list of new sessions, soonest first. Side effect: this
 * also resets `last_seen_sessions_at` to now, so a session shown here still
 * counts as new to the viewer, but the next call -- the next time they open
 * Home or /sessions -- only returns what showed up after this one.
 */
export async function listNewSessionsInMyCourses(): Promise<NewCourseSession[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("new_sessions_in_my_courses");
  if (error) {
    throw new Error(`Could not load new sessions: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    topic: row.topic,
    course: {
      departmentCode: row.department_code,
      number: row.course_number,
      title: row.course_title,
    },
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationLabel: row.location_label,
  }));
}

/**
 * Resets `last_seen_sessions_at` without returning anything. /sessions calls
 * this: browsing the open-sessions list already shows a student what is new
 * in their courses, so the badge should not nag them about sessions they
 * just scrolled past.
 */
export async function markSessionsSeen(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_sessions_seen");
  if (error) {
    throw new Error(`Could not update what you've seen: ${error.message}`);
  }
}
