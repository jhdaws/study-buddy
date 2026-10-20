/**
 * One study session (US-03). Built by W5 (#12), restyled to the Claude
 * Design spec (page 8, "Session cards"): a dark glass card with the course,
 * a seats pill, the topic, a When / Where / Host panel and a seats bar.
 *
 * Two variants: "full" for the /sessions list, "compact" for the home
 * page's horizontal feed.
 *
 * Renders a SessionListItem (src/lib/sessions.ts) as is -- every derived value
 * (seats left, host name) arrives already derived, and this only formats it.
 * No hooks, so it renders as a Server Component today and still works if
 * SessionBrowser becomes a Client Component for M4's map toggle. Times are
 * formatted in campus time explicitly (src/lib/format.ts), so either side
 * prints the same words (the spacing characters can differ; see `when`).
 *
 * The spec's avatar stack needs attendee names, which SessionListItem does
 * not carry (and showing who is going is US-23, a later sprint). The seats
 * bar shows the same thing honestly: how many are going, out of how many.
 *
 * The whole card opens the session page (/sessions/[id], S6): the course
 * heading is the link, and its ::after stretches over the card (which is
 * `relative`), so the tap target is the card while the link's accessible
 * name stays just the course.
 */

import Link from "next/link";

import Icon from "@/components/ui/Icon";
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
  variant?: "full" | "compact";
  /** The course heading's level: h3 when the list groups cards under day headings. */
  headingLevel?: "h2" | "h3";
};

export function SeatsPill({ seatsLeft }: { seatsLeft: number }) {
  const full = seatsLeft <= 0;
  const last = seatsLeft === 1;
  return (
    <p
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold " +
        (full
          ? "border-white/15 bg-navy-950 text-white"
          : last
            ? "border-amber/40 bg-amber/15 text-amber"
            : "border-success/40 bg-success/15 text-success-on-dark")
      }
    >
      <Icon name="seat" className="size-4" />
      {formatSeatsLeft(seatsLeft)}
    </p>
  );
}

export function LivePill() {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-sm font-bold text-white">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inline-flex size-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-white" />
      </span>
      Happening now
    </p>
  );
}

function SeatsBar({ taken, capacity, full }: { taken: number; capacity: number; full: boolean }) {
  // One segment per seat up to 12; beyond that a single proportional bar.
  const segments = capacity <= 12;
  return (
    <div className="flex items-center gap-3">
      {segments ? (
        <div aria-hidden className="flex flex-1 gap-1">
          {Array.from({ length: capacity }, (_, i) => (
            <span
              key={i}
              className={
                "h-1.5 flex-1 rounded-full " +
                (i < taken ? (full ? "bg-white/45" : "bg-blue-300") : "border border-success/60 bg-success/10")
              }
            />
          ))}
        </div>
      ) : (
        <div aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-full bg-success/15">
          <div
            className={full ? "h-full bg-white/45" : "h-full bg-blue-300"}
            style={{ width: `${Math.min(100, (taken / capacity) * 100)}%` }}
          />
        </div>
      )}
      <p className="shrink-0 text-sm font-semibold text-white/80">
        {taken} of {capacity} going
      </p>
    </div>
  );
}

export default function SessionCard({
  session,
  now,
  variant = "full",
  headingLevel = "h2",
}: SessionCardProps) {
  const Heading = headingLevel;
  const full = session.seatsLeft === 0;
  const live = isInProgress(session.startsAt, session.endsAt, now);
  const headingId = `session-${session.id}`;
  const host = session.hostDisplayName ?? "Deleted user";
  const where = (
    <>
      {session.locationLabel}
      {session.room && <> · {session.room}</>}
    </>
  );
  // suppressHydrationWarning: Node's ICU and the browser's put different
  // invisible spaces around the dash and before AM/PM (see format.test.ts).
  // The words are identical; only this element's text may differ.
  const when = (
    <time dateTime={session.startsAt} suppressHydrationWarning>
      {formatSessionTime(session.startsAt, session.endsAt, now)}
    </time>
  );

  const heading = (
    // The id labels the article; scroll-mt keeps the heading clear of the
    // sticky top bar if anything links to /sessions#session-<id>.
    <Heading id={headingId} className="scroll-mt-24 text-base leading-snug">
      <Link
        href={`/sessions/${session.id}`}
        className="rounded-sm after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-blue-300"
      >
        <span className="font-extrabold">{formatCourseCode(session.course)}</span>
        {session.course.title && (
          <span className="font-medium text-white/72"> · {session.course.title}</span>
        )}
      </Link>
    </Heading>
  );

  if (variant === "compact") {
    return (
      <article
        aria-labelledby={headingId}
        data-full={full || undefined}
        className={`glass-dark relative flex h-full flex-col gap-3 rounded-card p-4 text-white ${full ? "opacity-80" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          {live ? <LivePill /> : <span />}
          <SeatsPill seatsLeft={session.seatsLeft} />
        </div>
        <div>
          {heading}
          <p className="mt-1 text-lg leading-snug font-extrabold">{session.topic}</p>
        </div>
        <dl className="flex flex-col gap-1.5 text-sm text-white/80">
          <div className="flex items-center gap-2">
            <dt>
              <Icon name="clock" className="size-4" />
              <span className="sr-only">When</span>
            </dt>
            <dd>{when}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <Icon name="pin" className="size-4" />
              <span className="sr-only">Where</span>
            </dt>
            <dd className="truncate">{where}</dd>
          </div>
        </dl>
        <p className="mt-auto border-t border-white/10 pt-3 text-sm text-white/72">
          Host <span className="font-bold text-white">{host}</span>
        </p>
      </article>
    );
  }

  return (
    <article
      aria-labelledby={headingId}
      data-full={full || undefined}
      className={`glass-dark relative rounded-card p-4 text-white sm:p-5 ${full ? "opacity-80 saturate-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {live && (
            <div className="mb-2">
              <LivePill />
            </div>
          )}
          {heading}
        </div>
        <SeatsPill seatsLeft={session.seatsLeft} />
      </div>

      <p className="mt-2 text-xl leading-snug font-extrabold tracking-tight">{session.topic}</p>

      <dl className="mt-4 grid gap-3 rounded-inner border border-white/10 bg-white/[0.06] p-3.5 text-sm sm:grid-cols-[1fr_1.4fr_auto] sm:gap-4">
        <div>
          <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">When</dt>
          <dd className="mt-0.5 font-semibold">{when}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Where</dt>
          <dd className="mt-0.5 font-semibold">{where}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Host</dt>
          <dd className="mt-0.5 font-semibold">{host}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <SeatsBar taken={session.attendeeCount} capacity={session.capacity} full={full} />
      </div>
    </article>
  );
}
