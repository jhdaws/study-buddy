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
 * Study requests (US-16, R1) sit in their own section below the list, with
 * their own read (listStudyRequests) and the department list the ask form
 * needs. They are deliberately not part of SessionBrowser: the filters do not
 * apply to them, and they must still show when the list is empty -- which is
 * exactly when a student most needs them.
 *
 * Search and filter chips run in the browser over this list
 * (SessionBrowser, src/lib/session-filters.ts), and so does the List / Map
 * toggle (M4): `?view=map` is read in the browser component, which is why
 * this page never looks at its searchParams. A server-side course filter
 * (US-06) comes later; see the comment in SessionBrowser.tsx.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import Link from "next/link";

import SessionBrowser from "@/components/SessionBrowser";
import StudyRequests from "@/components/StudyRequests";
import { BUTTON_PRIMARY, PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
import { listDepartments, listSessions } from "@/lib/sessions";
import { listStudyRequests } from "@/lib/study-requests";

export const metadata: Metadata = {
  title: "Study sessions",
};

export default async function SessionsPage() {
  // The list is per request: which sessions have ended depends on the clock,
  // and S4's query reads the signed-in user's cookies. Without this the
  // fixture stub, which touches neither, could be prerendered at build time
  // and frozen.
  await connection();

  // In parallel: three independent reads, and the page shows all three. Run
  // in series this would be three round trips deep before anything renders.
  // Promise.all, not allSettled: if any one fails the page's error boundary
  // (./error.tsx) offers a retry, which is better than a list with a silently
  // missing half.
  const [sessions, requests, departments] = await Promise.all([
    listSessions(),
    listStudyRequests(),
    listDepartments(),
  ]);
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
      {/* Below the list on purpose: a student who found their session never
          needs this, and one who did not has just read "no sessions match". */}
      <StudyRequests requests={requests} departments={departments} />
    </main>
  );
}
