/**
 * One study session as a card (US-03), from the 2026-10-20 redesign: the same
 * card on Home, Sessions (list and board), My sessions and the host preview.
 *
 *   Row 1  status pill, then Hosting or Joined when it applies
 *   Row 2  course code (never truncated) · course title (truncated)
 *   Row 3  the topic, up to two lines -- the card's heading
 *   Row 4  time, and place
 *   Row 5  who is going (three faces, then +n), and seats taken of total
 *
 * Each department has its own soft wash behind the card (src/lib/
 * departments.ts); a full session's wash is quieter, and past or cancelled
 * sessions are plain white with the topic struck through.
 *
 * The whole card is one link to the session page. No hooks, so it renders in
 * Server and Client Components alike; every derived value comes from
 * src/lib/session-view.ts, which is unit tested.
 *
 * The heading keeps `id="session-<id>"`: the calendar journey reads it.
 */

import Link from "next/link";

import Icon from "@/components/ui/Icon";
import { cardWash } from "@/lib/departments";
import { formatCourseCode } from "@/lib/format";
import {
  avatarStack,
  cardTime,
  PILLS,
  seatsText,
  sessionRelation,
  sessionStatus,
  type SessionRelation,
  type SessionStatus,
} from "@/lib/session-view";
import type { SessionListItem } from "@/lib/sessions";

export type SessionCardProps = {
  session: SessionListItem & { status?: "open" | "cancelled" };
  /** The request's "now", for status and times. */
  now: Date;
  /** The signed-in student, for the Hosting and Joined pills. */
  viewerId?: string | null;
  /** Lead the time with the day, for cards not under a day heading. */
  showDay?: boolean;
  /** Put Hosting/Joined before the status pill (My sessions, Your sessions). */
  relationFirst?: boolean;
  /** The heading level: h3 under section headings, h2 on its own. */
  headingLevel?: "h2" | "h3";
  /** Render without the link, for the host form's preview. */
  asPreview?: boolean;
};

export function Pill({ kind }: { kind: SessionStatus | SessionRelation }) {
  const pill = PILLS[kind];
  return (
    <span
      className="inline-flex h-[22px] items-center gap-1.5 rounded-lg px-2 text-xs font-medium whitespace-nowrap"
      style={{ background: pill.bg, color: pill.fg }}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: pill.fg }} />
      {pill.label}
    </span>
  );
}

export function AvatarStack({
  going,
  size = 24,
}: {
  going: SessionListItem["going"];
  size?: number;
}) {
  const { faces, more } = avatarStack(going);
  if (faces.length === 0) return <span className="min-h-6" />;
  return (
    <span className="flex min-h-6 items-center pl-1" aria-hidden>
      {faces.map((face, i) => (
        <span
          key={face.userId}
          className="-ml-0.5 flex shrink-0 items-center justify-center rounded-full font-semibold"
          style={{
            width: size,
            height: size,
            fontSize: size <= 24 ? 10 : 11,
            background: face.bg,
            color: face.fg,
            zIndex: 4 - i,
            boxShadow: "0 0 0 1.5px #FFFFFF",
            position: "relative",
          }}
        >
          {face.initials}
        </span>
      ))}
      {more > 0 && (
        <span
          className="-ml-0.5 flex h-6 min-w-6 items-center justify-center rounded-xl bg-column px-1.5 text-[10px] font-semibold text-ink-2"
          style={{ boxShadow: "0 0 0 1.5px #FFFFFF" }}
        >
          +{more}
        </span>
      )}
    </span>
  );
}

export default function SessionCard({
  session,
  now,
  viewerId,
  showDay = false,
  relationFirst = false,
  headingLevel = "h3",
  asPreview = false,
}: SessionCardProps) {
  const Heading = headingLevel;
  const status = sessionStatus(session, now);
  const relation = sessionRelation(session, viewerId);
  const past = status === "ended" || status === "cancelled";
  const full = status === "full";
  const code = formatCourseCode(session.course);
  const time = cardTime(session.startsAt, session.endsAt, now, showDay);
  const place = session.room ? `${session.locationLabel}, ${session.room}` : session.locationLabel;
  const pills = relationFirst && relation ? [relation, status] : [status, relation];
  const headingId = `session-${session.id}`;

  const body = (
    <>
      <span className="flex min-h-[22px] items-center gap-1.5">
        {pills.filter(Boolean).map((kind) => (
          <Pill key={kind} kind={kind as SessionStatus | SessionRelation} />
        ))}
      </span>
      <span className="flex min-w-0 gap-1.5 text-[13px] whitespace-nowrap">
        <span className={`shrink-0 font-semibold ${past ? "text-ink-2" : "text-ink"}`}>{code}</span>
        {session.course.title && (
          <>
            <span aria-hidden className="shrink-0 text-ink-2">
              ·
            </span>
            <span className="min-w-0 truncate text-ink-2">{session.course.title}</span>
          </>
        )}
      </span>
      <Heading
        id={headingId}
        className={`line-clamp-2 text-[15px] leading-[1.35] font-semibold [text-wrap:pretty] ${
          past ? "text-ink-2 line-through" : "text-ink"
        }`}
      >
        {session.topic}
      </Heading>
      <span className="flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Icon name={past ? "calendar" : "clock"} size={14} />
          <time dateTime={session.startsAt} suppressHydrationWarning>
            {time}
          </time>
        </span>
        <span className="flex min-w-0 max-w-full items-center gap-1.5">
          <Icon name="pin" size={14} />
          <span className="min-w-0 truncate">{place}</span>
        </span>
      </span>
      <span className="mt-1 flex items-center justify-between gap-3">
        <AvatarStack going={session.going} />
        <span
          className={`flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${
            past || full ? "text-ink-2" : "text-seat"
          }`}
        >
          <Icon name="users" size={14} />
          {seatsText(session.attendeeCount, session.capacity)}
        </span>
      </span>
    </>
  );

  const className =
    "relative flex min-w-0 flex-col gap-2 rounded-xl border p-4 text-left text-sm text-ink " +
    "shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_24px_-12px_rgba(17,24,39,0.10)] transition-colors";
  const style = {
    background: past ? "#FFFFFF" : cardWash(session.course.departmentCode, full),
    borderColor: past ? "#E6E8EC" : "rgba(17,24,39,0.07)",
  };

  if (asPreview) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }
  return (
    <Link
      href={`/sessions/${session.id}`}
      aria-labelledby={headingId}
      data-full={full || undefined}
      className={`${className} hover:!border-line-strong`}
      style={style}
    >
      {body}
    </Link>
  );
}
