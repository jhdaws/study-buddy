/**
 * One study session in the list (US-03). Built by W5 (#12).
 *
 * Renders a SessionListItem (src/lib/sessions.ts) as is -- every derived value
 * (seats left, host name) arrives already derived, and this only formats it.
 * No hooks, so it renders as a Server Component today and still works if
 * SessionBrowser becomes a Client Component for M4's map toggle. Times are
 * formatted in campus time explicitly (src/lib/format.ts), so either side
 * prints the same thing.
 *
 * Not a link yet: the detail page (/sessions/[id]) is a later sprint. When it
 * lands, wrap the course heading in a <Link href={`/sessions/${session.id}`}>.
 */

import type { SessionListItem } from "@/lib/sessions";
import {
  formatCourseCode,
  formatSeatsLeft,
  formatSessionTime,
  isInProgress,
} from "@/lib/format";

export type SessionCardProps = {
  session: SessionListItem;
  /** The request's "now", for "Today"/"Tomorrow" and "Happening now". */
  now: Date;
};

export default function SessionCard({ session, now }: SessionCardProps) {
  const full = session.seatsLeft === 0;
  const headingId = `session-${session.id}`;

  return (
    <article
      aria-labelledby={headingId}
      data-full={full || undefined}
      className={
        full
          ? "rounded-lg border border-neutral-200 bg-neutral-100 p-4 text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
          : "rounded-lg border border-neutral-300 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-950"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="text-base leading-snug">
          <span className="font-semibold">{formatCourseCode(session.course)}</span>
          {session.course.title && (
            <span className="text-neutral-600 dark:text-neutral-400">
              {" "}· {session.course.title}
            </span>
          )}
        </h2>
        <p
          className={
            full
              ? "shrink-0 rounded-full bg-neutral-700 px-2.5 py-0.5 text-sm font-semibold text-white dark:bg-neutral-300 dark:text-neutral-900"
              : "shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-sm font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          }
        >
          {formatSeatsLeft(session.seatsLeft)}
        </p>
      </div>

      <p className="mt-1 text-base">{session.topic}</p>

      <dl className="mt-3 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-1 text-sm">
        <dt className="text-neutral-500 dark:text-neutral-400">When</dt>
        <dd>
          {isInProgress(session.startsAt, session.endsAt, now) && (
            <span className="font-medium">Happening now · </span>
          )}
          <time dateTime={session.startsAt}>
            {formatSessionTime(session.startsAt, session.endsAt, now)}
          </time>
        </dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Where</dt>
        <dd>
          {session.locationLabel}
          {session.room && <> · {session.room}</>}
        </dd>
        <dt className="text-neutral-500 dark:text-neutral-400">Host</dt>
        <dd>{session.hostDisplayName ?? "Deleted user"}</dd>
      </dl>
    </article>
  );
}
