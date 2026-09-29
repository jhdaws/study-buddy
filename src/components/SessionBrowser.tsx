/**
 * The session list, and later its map toggle and filters (US-03; US-06 and
 * US-12 later). Built by W5 (#12).
 *
 * Takes the SessionListItem[] that listSessions() returns (src/lib/sessions.ts,
 * via the page) and renders one <SessionCard> each, in the order given --
 * listSessions() already sorts soonest first and drops ended and cancelled
 * sessions. A Server Component: the list alone needs no browser.
 *
 * The empty state recruits the visitor into hosting rather than saying
 * "nothing here": with no sessions, the only way the list fills is someone
 * starting one (the cold-start problem, US-16).
 *
 * Later:
 *   - List / map toggle (M4, #25, stretch). List stays the DEFAULT view, the
 *     map one tap away (ADR 0004). THE SEAM: add a "use client" wrapper here
 *     holding the toggle state, render the existing <ul> of cards for the
 *     list view, and load <SessionMap> with next/dynamic (ssr: false) for the
 *     map view -- the Maps API needs a browser. SessionCard has no hooks, so
 *     it renders unchanged inside a Client Component. The page does not
 *     change.
 *   - Course filter (US-06). The campus-zone filter (US-12) has no data to
 *     filter on now that there is no building list (ADR 0008) -- rethink it
 *     before building it.
 */

import Link from "next/link";

import SessionCard from "@/components/SessionCard";
import type { SessionListItem } from "@/lib/sessions";

export type SessionBrowserProps = {
  sessions: SessionListItem[];
  /** The request's "now", passed to each card. */
  now: Date;
};

export default function SessionBrowser({ sessions, now }: SessionBrowserProps) {
  if (sessions.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="Upcoming study sessions">
      {sessions.map((session) => (
        <li key={session.id}>
          <SessionCard session={session} now={now} />
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <section
      aria-labelledby="no-sessions"
      className="rounded-lg border border-dashed border-neutral-300 px-4 py-8 text-center dark:border-neutral-700"
    >
      <h2 id="no-sessions" className="text-lg font-semibold">
        No study sessions yet
      </h2>
      <p className="mt-2 text-base text-neutral-600 dark:text-neutral-400">
        Studying something today? Start a session and classmates taking the
        same course can find you and join.
      </p>
      <Link
        href="/sessions/new"
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Host the first session
      </Link>
    </section>
  );
}
