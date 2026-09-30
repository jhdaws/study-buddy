/**
 * One session in the list (US-03, US-07, US-23; T-D3).
 *
 * A Server Component: nothing here needs state or the browser. The "Join"
 * affordance arrives with T-E4, which is when this needs a client boundary.
 */

import { isFull, seatsLeft, type DemoSession } from "@/lib/demo-store";

export default function SessionCard({ session }: { session: DemoSession }) {
  const full = isFull(session);
  const open = seatsLeft(session);

  return (
    <li className="rounded-lg border border-black/15 p-4 dark:border-white/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">
            {session.departmentCode} {session.courseNumber}
          </p>
          {session.courseTitle && (
            <p className="text-sm opacity-60">{session.courseTitle}</p>
          )}
        </div>

        {/* Full is a different state, not a smaller number — it decides
            whether walking over is worth it (US-07). */}
        <span
          className={
            full
              ? "shrink-0 rounded-full bg-black/10 px-2.5 py-1 text-sm font-medium opacity-70 dark:bg-white/15"
              : "shrink-0 rounded-full bg-green-600/15 px-2.5 py-1 text-sm font-medium text-green-800 dark:text-green-300"
          }
        >
          {full ? "Full" : `${open} ${open === 1 ? "seat" : "seats"} left`}
        </span>
      </div>

      <p className="mt-3 text-base">{session.topic}</p>

      <dl className="mt-3 flex flex-col gap-1 text-sm opacity-80">
        <div className="flex gap-2">
          <dt className="sr-only">Where</dt>
          <dd>
            {session.locationName}
            {session.room && ` · ${session.room}`}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">When</dt>
          <dd>
            <time dateTime={session.startsAt}>
              {formatRange(session.startsAt, session.endsAt)}
            </time>
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="sr-only">Attending</dt>
          <dd>
            {session.attendeeCount} of {session.capacity} going
          </dd>
        </div>
      </dl>
    </li>
  );
}

/**
 * "Tue, Sep 29, 2:00 – 4:00 PM", collapsing the date when both ends share it.
 */
function formatRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const time = (value: Date) =>
    value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = sameDay
    ? time(end)
    : `${end.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time(end)}`;

  return `${day}, ${time(start)} – ${endLabel}`;
}
