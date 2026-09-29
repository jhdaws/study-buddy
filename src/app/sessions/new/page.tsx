/**
 * Create a study session (US-02).
 *
 * TODO (W5, #12):
 *   - `await requireUser()` (src/lib/supabase/server.ts) first: once A4 (#17)
 *     lands it redirects signed-out users to /login and nameless ones to the
 *     name step. Until then it returns the fixture user.
 *   - `await listDepartments()` (src/lib/sessions.ts) for the department
 *     picker. Courses are NOT fetched here: the course-number field is a
 *     typeahead that calls fetchCourseSuggestions() as the host types.
 *     There is no building list -- the location comes from <LocationPicker>.
 *   - Render <CreateSessionForm> with the departments.
 */
export default function NewSessionPage() {
  return (
    <main>
      <h1>Start a study session</h1>
    </main>
  );
}
