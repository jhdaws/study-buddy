// Reading a student's academic profile (US-11). Owner: P1.
//
// SERVER ONLY, like sessions.ts: it reads through the cookie-bound client, so
// A2's and P1's policies apply as the signed-in user -- any signed-in student
// may read any profile and its current courses, and nobody signed out may
// read either (tests/db/academic-profile.test.ts). Never selects an email:
// there is none in `public` to select (US-25, ADR 0008 rule 16).
//
// Client code may `import type` from here; the profile page passes the data
// to <ProfileForm> as props.

import "server-only";

import { type ClassYear, courseKey } from "@/lib/academic";
import type { CourseLabel } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/server";

/** A profile as the profile page shows it. Every field but the name is optional. */
export type Profile = {
  displayName: string | null;
  major: string | null;
  minor: string | null;
  classYear: ClassYear | null;
  /** The courses they are taking now, ordered by department then number. */
  courses: CourseLabel[];
};

// The courses come through the join table, named explicitly. A bare
// `courses (...)` embed from profiles would be AMBIGUOUS (PGRST201):
// PostgREST can also reach courses from a profile through `sessions` (host_id
// and course_id) and through courses.created_by.
const PROFILE_SELECT =
  "display_name, major, minor, class_year, profile_courses (courses (department_code, number, title))";

/** `userId`'s profile, or null when there is no such profile. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the profile: ${error.message}`);
  }
  if (!data) return null;

  const courses = data.profile_courses
    .map(({ courses: course }) => ({
      departmentCode: course.department_code,
      number: course.number,
      title: course.title,
    }))
    .sort((a, b) => courseKey(a).localeCompare(courseKey(b)));

  return {
    displayName: data.display_name,
    major: data.major,
    minor: data.minor,
    classYear: data.class_year,
    courses,
  };
}
