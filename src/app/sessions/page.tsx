/**
 * Browse study sessions (US-03). Built by W5 (#12).
 *
 * `listSessions()` (src/lib/sessions.ts) returns open sessions that have not
 * ended, soonest first, with seats left already derived. The list itself is
 * <SessionBrowser>.
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
 * Search and the when/has-seats chips still run in the browser over this list
 * (SessionBrowser, src/lib/session-filters.ts), and so does the List / Map
 * toggle (M4): `?view=map` is read in the browser. The COURSE filter (US-06)
 * is different -- it lives in the URL as `?course=CS-3251` and is applied
 * inside listSessions() itself, so a filtered view is shareable and does not
 * depend on sessions the page never loaded. This page reads that param; the
 * chips in SessionBrowser write it.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import Link from "next/link";

import SessionBrowser from "@/components/SessionBrowser";
import StudyRequests from "@/components/StudyRequests";
import { BUTTON_PRIMARY, PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
import { COURSE_PARAM, parseCourseParam } from "@/lib/session-course";
import { listDepartments, listSessions } from "@/lib/sessions";
import { listStudyRequests } from "@/lib/study-requests";

export const metadata: Metadata = {
  title: "Study sessions",
};

type SessionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** The first value for `key` -- `?course=a&course=b` is legal URL syntax. */
function one(
  params: Awaited<SessionsPageProps["searchParams"]>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  // The list is per request: which sessions have ended depends on the clock,
  // S4's query reads the signed-in user's cookies, and the course filter
  // comes from the URL. Without this the page could be prerendered at build
  // time and frozen.
  await connection();

  const params = await searchParams;
  const course = parseCourseParam(one(params, COURSE_PARAM));
  // In parallel: three independent reads, and the page shows all three. Run
  // in series this would be three round trips deep before anything renders.
  // Promise.all, not allSettled: if any one fails the page's error boundary
  // (./error.tsx) offers a retry, which is better than a list with a silently
  // missing half.
  const [sessions, requests, departments] = await Promise.all([
    listSessions(course ? { course } : {}),
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
      <SessionBrowser sessions={sessions} now={now} courseFilter={course} />
      {/* Below the list on purpose: a student who found their session never
          needs this, and one who did not has just read "no sessions match". */}
      <StudyRequests requests={requests} departments={departments} />
    </main>
  );
}
