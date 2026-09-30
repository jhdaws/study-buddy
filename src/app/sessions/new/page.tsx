/**
 * Create a study session (US-02).
 *
 * The department, course, and location lists come from src/lib/fixtures.ts for
 * the Sprint 2 demo. T-C2 and T-C3 replace them with real queries; T-D6
 * replaces the location select with Google Places autocomplete.
 */

import CreateSessionForm from "@/components/CreateSessionForm";

export default function NewSessionPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <h1 className="text-2xl font-semibold">Start a study session</h1>
      <p className="mt-2 text-sm opacity-70">
        Tell classmates what you are working on and where to find you.
      </p>

      <div className="mt-8">
        <CreateSessionForm />
      </div>
    </main>
  );
}
