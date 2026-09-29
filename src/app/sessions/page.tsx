/**
 * Browse study sessions (US-03). Built by W5 (#12).
 *
 * `listSessions()` (src/lib/sessions.ts) returns open sessions that have not
 * ended, soonest first, with seats left already derived. It is a W4 stub
 * returning fixtures until S4 (#21) lands; this page does not change when it
 * does. The list itself is <SessionBrowser>.
 *
 * If listSessions() throws, ./error.tsx shows a retry screen rather than a
 * blank page.
 *
 * Filters (US-06 course, US-12 campus zone) and the map (M4) come later; see
 * the comment in SessionBrowser.tsx.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import SessionBrowser from "@/components/SessionBrowser";
import { listSessions } from "@/lib/sessions";

export const metadata: Metadata = {
  title: "Study sessions",
};

export default async function SessionsPage() {
  // The list is per request: which sessions have ended depends on the clock,
  // and S4's query reads the signed-in user's cookies. Without this the
  // fixture stub, which touches neither, could be prerendered at build time
  // and frozen.
  await connection();

  const sessions = await listSessions();
  const now = new Date();

  return (
    <main>
      <h1 className="text-2xl font-semibold">Study sessions</h1>
      <p className="mt-1 mb-4 text-base text-neutral-600 dark:text-neutral-400">
        Open sessions on campus, soonest first. Times are campus time.
      </p>
      <SessionBrowser sessions={sessions} now={now} />
    </main>
  );
}
