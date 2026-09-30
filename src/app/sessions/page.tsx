/**
 * Browse study sessions (US-03; T-D3, the list half of T-E3).
 *
 * Reads the in-memory demo store, so the list resets when the server
 * restarts — see src/lib/demo-store.ts. T-E3 replaces the read with a real
 * query; the filters and the map toggle are T-D4 and T-D5.
 */

import Link from "next/link";

import SessionCard from "@/components/SessionCard";
import { findSession, listOpenSessions } from "@/lib/demo-store";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>;
}) {
  const { created } = await searchParams;
  const sessions = listOpenSessions();
  const justCreated = created ? findSession(created) : undefined;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold">Study sessions</h1>
        <Link
          href="/sessions/new"
          className="text-base font-medium underline underline-offset-4"
        >
          Start one
        </Link>
      </div>

      {justCreated && (
        <p
          role="status"
          className="mt-4 rounded-lg border border-green-600/40 bg-green-600/10 p-3 text-sm"
        >
          Your {justCreated.departmentCode} {justCreated.courseNumber} session
          is listed below. Nothing is saved to a database yet — it disappears
          when the server restarts.
        </p>
      )}

      {sessions.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </ul>
      )}
    </main>
  );
}

/**
 * The cold start (US-16). Someone arriving to an empty list is the person most
 * able to fix it, so this recruits them rather than reporting a vacancy.
 */
function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-black/20 p-6 text-center dark:border-white/25">
      <p className="text-base font-medium">No sessions running right now.</p>
      <p className="mt-1 text-sm opacity-70">
        Start one and your classmates will see it here.
      </p>
      <Link
        href="/sessions/new"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-base font-medium text-background"
      >
        Start a study session
      </Link>
    </div>
  );
}
