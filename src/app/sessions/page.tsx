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
import { BUTTON_PRIMARY, PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
import { COURSE_PARAM, parseCourseParam } from "@/lib/session-course";
import { listSessions } from "@/lib/sessions";

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
  const sessions = await listSessions(course ? { course } : {});
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
    </main>
  );
}
