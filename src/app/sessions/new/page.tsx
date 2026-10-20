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

export const metadata: Metadata = {
  title: "Host a session",
};

export default async function NewSessionPage() {
  await requireUser();
  const departments = await listDepartments();

  return (
    <main className="min-w-0">
      <h1 className={PAGE_TITLE}>Host a study session</h1>
      <p className={`${PAGE_LEAD} mb-6`}>
        Say what you&apos;re studying, where and when. Classmates see it in the
        session list.
      </p>
      <CreateSessionForm departments={departments} />
    </main>
  );
}
