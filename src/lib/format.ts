// Display formatting for sessions and courses. Pure and client-safe; unit
// tested in format.test.ts.
//
// TIMES ARE SHOWN IN CAMPUS TIME, EXPLICITLY. Session times arrive as UTC ISO
// strings (SessionListItem.startsAt/endsAt) and are formatted in Server
// Components, which on Vercel run in UTC. Every formatter here passes
// `timeZone: CAMPUS_TIME_ZONE`, so the output is the same on a laptop, on
// Vercel and in CI. Why campus time rather than the viewer's: see
// CAMPUS_TIME_ZONE in src/lib/env.ts.

import { CAMPUS_TIME_ZONE } from "@/lib/env";
import type { CourseLabel } from "@/lib/sessions";

const LOCALE = "en-US";

/** `2:00 PM`; as a range, `2:00 – 4:00 PM`. */
const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** `Thu, Oct 1` */
const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

const dayPartsFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The calendar day `date` falls on in campus time, as a whole number of days
 * since the epoch. Comparing these is DST-safe, unlike adding 24 hours to
 * "now" (a day is 23 or 25 hours twice a year).
 */
function campusDay(date: Date): number {
  const parts = dayPartsFormat.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

/** `Today`, `Tomorrow`, `Yesterday`, or `Thu, Oct 1` -- relative to `now`, in campus time. */
export function formatCampusDay(date: Date, now: Date): string {
  const offset = campusDay(date) - campusDay(now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return dateFormat.format(date);
}

/**
 * When a session runs, in campus time:
 * - `Today · 2:00 – 4:00 PM`
 * - `Thu, Oct 1 · 11:30 AM – 1:00 PM`
 * - `Today, 11:00 PM – Tomorrow, 1:00 AM` when it runs past midnight.
 *
 * `startsAt`/`endsAt` are ISO instants (SessionListItem's UTC strings).
 */
export function formatSessionTime(
  startsAt: string,
  endsAt: string,
  now: Date,
): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const startDay = formatCampusDay(start, now);

  if (campusDay(start) === campusDay(end)) {
    return `${startDay} · ${timeFormat.formatRange(start, end)}`;
  }
  return `${startDay}, ${timeFormat.format(start)} – ${formatCampusDay(end, now)}, ${timeFormat.format(end)}`;
}

/** True while a session is under way: started, not yet ended. */
export function isInProgress(startsAt: string, endsAt: string, now: Date): boolean {
  const nowMs = now.getTime();
  return Date.parse(startsAt) <= nowMs && nowMs < Date.parse(endsAt);
}

/** `CS 3251` */
export function formatCourseCode(course: Pick<CourseLabel, "departmentCode" | "number">): string {
  return `${course.departmentCode} ${course.number}`;
}

/** `Full`, `1 seat left`, `3 seats left`. 0 means full (SessionListItem.seatsLeft). */
export function formatSeatsLeft(seatsLeft: number): string {
  if (seatsLeft <= 0) return "Full";
  return seatsLeft === 1 ? "1 seat left" : `${seatsLeft} seats left`;
}

/** For the course typeahead: `No sessions yet`, `1 session`, `12 sessions`. */
export function formatSessionCount(count: number): string {
  if (count <= 0) return "No sessions yet";
  return count === 1 ? "1 session" : `${count} sessions`;
}
