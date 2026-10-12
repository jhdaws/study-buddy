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
 * Search and filter chips run in the browser over this list
 * (SessionBrowser, src/lib/session-filters.ts). A server-side course filter
 * (US-06) and the map (M4) come later; see the comment in SessionBrowser.tsx.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import Link from "next/link";

import SessionBrowser from "@/components/SessionBrowser";
import { BUTTON_PRIMARY, PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
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
    <main className="min-w-0">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>Study sessions</h1>
          <p className={PAGE_LEAD}>
            Open sessions on campus, soonest first. Times are campus time.
          </p>
        </div>
        {/* Desktop only: phones have the tab bar's Host button. */}
        <div className="hidden shrink-0 md:block">
          <Link href="/sessions/new" className={BUTTON_PRIMARY}>
            Host a session
          </Link>
        </div>
      </div>
      <SessionBrowser sessions={sessions} now={now} />
    </main>
  );
}
