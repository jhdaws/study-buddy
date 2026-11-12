// The academic profile's year of study (US-11), and how a profile is shown
// beside a name. Pure, dependency-free and client-safe: the profile form, the
// roster and validation.ts all import it. Unit tested in academic.test.ts.
//
// The values are the `class_year` enum in *_academic_profile.sql. The type
// comes from the generated schema, so adding a value to the enum fails the
// typecheck here until it has a label, and removing one does too.

import type { Database } from "@/lib/database.types";

/** `profiles.class_year`. */
export type ClassYear = Database["public"]["Enums"]["class_year"];

/** What the form's <select> and the roster show for each year. */
export const CLASS_YEAR_LABELS: Record<ClassYear, string> = {
  first_year: "First year",
  sophomore: "Sophomore",
  junior: "Junior",
  senior: "Senior",
  graduate: "Graduate student",
};

/** Every year, in the order the form offers them. */
export const CLASS_YEARS = Object.keys(CLASS_YEAR_LABELS) as [ClassYear, ...ClassYear[]];

/**
 * One line of context under a name on a roster: `Computer Science · Junior`,
 * either half alone, or null when the student has said neither.
 */
export function formatAcademicLine(
  major: string | null | undefined,
  classYear: ClassYear | null | undefined,
): string | null {
  const parts = [major?.trim() || null, classYear ? CLASS_YEAR_LABELS[classYear] : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** `CS 3251` -- how a profile course is written in the form and on the page. */
export function courseKey(course: { departmentCode: string; number: string }): string {
  return `${course.departmentCode} ${course.number}`;
}
