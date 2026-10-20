/**
 * One study session, as a row in a timetable (US-03). Built by W5 (#12);
 * redrawn in the 2026-10-11 calm pass: the start time sits in a left rail,
 * like a class schedule, and the rest reads as plain lines -- course, what
 * they're studying, where, who's hosting -- with the seats count on the right.
 *
 * Rows are meant to sit inside a list panel (SessionBrowser, the home page),
 * which draws the dividers. `showDay` adds "Today"/"Tomorrow"/"Thu, Oct 1"
 * above the time when the row is not already under a day heading.
 *
 * Renders a SessionListItem (src/lib/sessions.ts) as is -- every derived value
 * (seats left, host name) arrives already derived, and this only formats it.
 * No hooks, so it renders in Server and Client Components alike. Times are
 * formatted in campus time explicitly (src/lib/format.ts).
 *
 * "Add to calendar" downloads the session as an .ics file from US-19's route
 * (src/app/sessions/[id]/calendar.ics/route.ts).
 *
 * The whole row opens the session page (/sessions/[id], S6): the course
 * heading is the link, and its ::after stretches over the row (which is
 * `relative`), so the tap target is the row while the link's accessible name
 * stays just the course. "Add to calendar" sits above that overlay (`z-10`),
 * so it still downloads rather than opening the page.
 */

import Link from "next/link";

import Icon from "@/components/ui/Icon";
import type { SessionListItem } from "@/lib/sessions";
import {
  formatCampusDay,
  formatCourseCode,
  formatSeatsLeft,
  formatStartTime,
  isInProgress,
} from "@/lib/format";

export type SessionCardProps = {
  session: SessionListItem;
  /** The request's "now", for the day label and "Now". */
  now: Date;
  /** Show the campus day above the start time. */
  showDay?: boolean;
  /** The course heading's level: h3 under day headings, h2 on its own. */
  headingLevel?: "h2" | "h3";
};

export function SeatsLabel({ seatsLeft }: { seatsLeft: number }) {
  if (seatsLeft <= 0) {
    return (
      <span className="shrink-0 rounded-md bg-paper px-2 py-0.5 text-sm font-semibold text-ink-2">
        {formatSeatsLeft(seatsLeft)}
      </span>
    );
  }
  return (
    <span className="shrink-0 text-sm font-semibold text-seat">{formatSeatsLeft(seatsLeft)}</span>
  );
}

export default function SessionCard({
  session,
  now,
  showDay = false,
  headingLevel = "h2",
}: SessionCardProps) {
  const Heading = headingLevel;
  const full = session.seatsLeft === 0;
  const live = isInProgress(session.startsAt, session.endsAt, now);
  const headingId = `session-${session.id}`;
  const host = session.hostDisplayName ?? "Deleted user";

  return (
    <article
      aria-labelledby={headingId}
      data-full={full || undefined}
      className="relative grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 px-4 py-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-5"
    >
      {/* Time rail. suppressHydrationWarning: Node's ICU and the browser's
          put different invisible spaces before AM/PM; the words match. */}
      <div className="pt-0.5">
        {showDay && (
          <p className="text-xs font-semibold text-ink-2">
            {formatCampusDay(new Date(session.startsAt), now)}
          </p>
        )}
        <time
          dateTime={session.startsAt}
          suppressHydrationWarning
          className="block text-[15px] leading-tight font-bold text-ink tabular-nums"
        >
          {formatStartTime(session.startsAt)}
        </time>
        {live ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-signal">
            <span aria-hidden className="size-1.5 rounded-full bg-signal" />
            Happening now
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-2" suppressHydrationWarning>
            to {formatStartTime(session.endsAt)}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <Heading id={headingId} className="min-w-0 scroll-mt-20 truncate text-[15px] leading-snug">
            <Link
              href={`/sessions/${session.id}`}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-signal"
            >
              <span className="font-bold text-ink">{formatCourseCode(session.course)}</span>
              {session.course.title && (
                <span className="font-medium text-ink-2"> {session.course.title}</span>
              )}
            </Link>
          </Heading>
          <SeatsLabel seatsLeft={session.seatsLeft} />
        </div>
        <p className={`mt-0.5 text-[15px] leading-snug font-semibold ${full ? "text-ink-2" : "text-ink"}`}>
          {session.topic}
        </p>
        <p className="mt-1.5 text-sm text-ink-2">
          {session.locationLabel}
          {session.room && <>, {session.room}</>}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-x-3 text-sm text-ink-2">
          <p className="min-w-0 truncate">
            Hosted by <span className="text-ink">{host}</span>
          </p>
          {/* Icon only on phones, with the words for screen readers. */}
          <a
            href={`/sessions/${session.id}/calendar.ics`}
            download
            className="relative z-10 -my-2 -mr-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 font-semibold text-signal hover:bg-paper"
          >
            <Icon name="calendar" className="size-[18px]" />
            <span className="sr-only sm:not-sr-only">Add to calendar</span>
            <span className="sr-only">: {formatCourseCode(session.course)}</span>
          </a>
        </div>
      </div>
    </article>
  );
}
