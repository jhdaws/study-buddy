// The shareable course filter on /sessions (US-06, S8).
//
// `?course=CS-3251` is read by the page, handed to listSessions(), and written
// by the course chips in SessionBrowser. Kept in its own module so the page
// (server), the browser component, and the tests can share one parser -- the
// format is the contract a shared link has to keep working.
//
// Client-safe: no server-only imports. Pure functions, unit tested in
// session-course.test.ts.

/** The search-param name. Spelled once so a rename cannot drift. */
export const COURSE_PARAM = "course";

// Normalisers inlined rather than imported from validation.ts: this module
// is imported by SessionBrowser (a Client Component), and validation.ts
// pulls zod -- every locale -- into the browser bundle (see limits.ts).
// Keep these identical to normalizeDepartmentCode / normalizeCourseNumber.
function normalizeDepartmentCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function normalizeCourseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** A course as the filter carries it -- no title, just what the URL holds. */
export type CourseFilter = {
  departmentCode: string;
  number: string;
};

/**
 * `CS-3251` from a CourseFilter. Hyphen, not a space: spaces in query
 * strings are awkward to share, and the human-readable `CS 3251` already
 * belongs to formatCourseCode().
 */
export function formatCourseParam(course: CourseFilter): string {
  return `${course.departmentCode}-${course.number}`;
}

/**
 * Parse `?course=CS-3251` (or a mistyped cousin) into a CourseFilter.
 *
 * Returns null when the value is missing, empty, or not a course: a shared
 * link with a typo should not filter the list into nothing by accident, and
 * the chips only ever write what this accepts. Normalised with S2's
 * normalisers so `cs-3251` and `CS-3251` are the same filter.
 *
 * The split is on the LAST hyphen: department codes are letters/digits after
 * normalisation (no hyphens left), and a course number is four digits plus
 * an optional letter -- neither side contains a hyphen once normalised, so
 * one hyphen is the whole format.
 */
export function parseCourseParam(
  raw: string | null | undefined,
): CourseFilter | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  const separator = trimmed.lastIndexOf("-");
  if (separator <= 0 || separator === trimmed.length - 1) return null;

  const departmentCode = normalizeDepartmentCode(trimmed.slice(0, separator));
  const number = normalizeCourseNumber(trimmed.slice(separator + 1));

  // Same shape createSessionSchema / get_or_create_course insist on: a
  // department of letters/digits and a four-digit course number. Anything
  // else is not a course we can look up.
  if (departmentCode === "" || !/^[0-9]{4}[A-Z]?$/.test(number)) return null;

  return { departmentCode, number };
}
