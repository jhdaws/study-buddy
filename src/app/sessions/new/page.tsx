/**
 * Create a study session (US-02). Built by W5 (#12).
 *
 *   - `requireUser()` (src/lib/supabase/server.ts) first: it redirects
 *     signed-out users to /login and nameless ones to the name step (A4,
 *     #17). The proxy already sends signed-out visitors away from
 *     /sessions*; this is the check that does not depend on it. (createSession
 *     calls it again: the action is a public endpoint and cannot trust this
 *     page.)
 *   - `listDepartments()` (src/lib/sessions.ts) for the department picker.
 *     Courses are NOT fetched here: the course-number field is a typeahead
 *     that calls fetchCourseSuggestions() as the host types. There is no
 *     building list -- the location comes from <LocationPicker>.
 *   - <CreateSessionForm> does the rest; on success createSession redirects
 *     to /sessions.
 */

import type { Metadata } from "next";

import CreateSessionForm from "@/components/CreateSessionForm";
import { PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
import { listDepartments } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";
import { normalizeCourseNumber, normalizeDepartmentCode } from "@/lib/validation";

export const metadata: Metadata = {
  title: "Host a session",
};

/**
 * `?department=CS&course=3251` prefills the course, which is what "Host one"
 * on a study request links to (US-16). Normalised with S2's normalisers
 * before it reaches the form: the link is hand-editable, and the <select>
 * only matches an option if the code is in the stored shape (`cs` -> `CS`).
 * Anything that does not match is harmless -- the select falls back to
 * "Choose a department", and createSession revalidates everything anyway.
 */
type NewSessionPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The first value for `key`, since `?department=CS&department=MATH` is legal. */
function one(params: Awaited<NewSessionPageProps["searchParams"]>, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function NewSessionPage({ searchParams }: NewSessionPageProps) {
  await requireUser();
  const [departments, params] = await Promise.all([listDepartments(), searchParams]);

  const departmentCode = normalizeDepartmentCode(one(params, "department"));
  const courseNumber = normalizeCourseNumber(one(params, "course"));

  return (
    <main className="min-w-0">
      <h1 className={PAGE_TITLE}>Host a study session</h1>
      <p className={`${PAGE_LEAD} mb-6`}>
        Say what you&apos;re studying, where and when. Classmates see it in the
        session list.
      </p>
      <CreateSessionForm
        departments={departments}
        initialState={
          departmentCode || courseNumber
            ? { values: { departmentCode, courseNumber } }
            : {}
        }
      />
    </main>
  );
}
