// What a session card shows, worked out from a session, the viewer and "now".
// Pure and unit tested, so the card itself only lays things out. From the
// 2026-10-20 redesign's session card spec.

import { CAMPUS_TIME_ZONE } from "@/lib/env";
import { campusDayOffset, formatCampusDay, formatInitial, isInProgress } from "@/lib/format";
import type { GoingPerson, SessionListItem } from "@/lib/sessions";

export type SessionStatus = "now" | "open" | "full" | "ended" | "cancelled";
export type SessionRelation = "hosting" | "joined";

/** The pill palette: label, background, text and dot. */
export const PILLS: Record<SessionStatus | SessionRelation, { label: string; bg: string; fg: string }> = {
  open: { label: "Open", bg: "#E8F5EE", fg: "#1F7A50" },
  now: { label: "Happening now", bg: "#E8F0FE", fg: "#2F5BEA" },
  full: { label: "Full", bg: "#F1F2F4", fg: "#6B7280" },
  hosting: { label: "Hosting", bg: "#F0EBFE", fg: "#6D4AE8" },
  joined: { label: "Joined", bg: "#E6F6F6", fg: "#0F766E" },
  ended: { label: "Ended", bg: "#F1F2F4", fg: "#6B7280" },
  cancelled: { label: "Cancelled", bg: "#F1F2F4", fg: "#6B7280" },
};

type ViewInput = Pick<SessionListItem, "startsAt" | "endsAt" | "seatsLeft" | "hostId" | "going"> & {
  status?: "open" | "cancelled";
};

/** Cancelled, then ended, then happening now, then full or open. */
export function sessionStatus(session: ViewInput, now: Date): SessionStatus {
  if (session.status === "cancelled") return "cancelled";
  if (Date.parse(session.endsAt) <= now.getTime()) return "ended";
  if (isInProgress(session.startsAt, session.endsAt, now)) return "now";
  return session.seatsLeft <= 0 ? "full" : "open";
}

/** "hosting" for the host, "joined" for anyone else on the roster, else null. */
export function sessionRelation(session: ViewInput, viewerId: string | null | undefined): SessionRelation | null {
  if (!viewerId) return null;
  if (session.hostId === viewerId) return "hosting";
  if (session.going?.some((person) => person.userId === viewerId)) return "joined";
  return null;
}

const time = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const shortDate = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});

/**
 * `7:00 to 9:00 PM`, or `7:00 PM to 1:00 AM` across noon or midnight -- the
 * design's ranges use "to", never a dash. Campus time.
 */
export function formatTimeRange(startsAt: string, endsAt: string): string {
  const start = time.formatToParts(new Date(startsAt));
  const end = time.formatToParts(new Date(endsAt));
  const clock = (parts: Intl.DateTimeFormatPart[]) =>
    parts
      .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "literal")
      .map((p) => p.value)
      .join("")
      .replace(/\s+$/, "")
      .replace(/[  ]/g, " ");
  const period = (parts: Intl.DateTimeFormatPart[]) => parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  const startPeriod = period(start);
  const endPeriod = period(end);
  return startPeriod === endPeriod
    ? `${clock(start)} to ${clock(end)} ${endPeriod}`
    : `${clock(start)} ${startPeriod} to ${clock(end)} ${endPeriod}`;
}

/**
 * The card's time line. Under a day heading only the range is needed; with
 * `withDay` it leads with the day ("Tomorrow, 4:00 to 5:30 PM"). A past
 * session shows its date instead ("Tue 7 Oct").
 */
export function cardTime(startsAt: string, endsAt: string, now: Date, withDay = false): string {
  if (Date.parse(endsAt) <= now.getTime()) {
    return shortDate.format(new Date(startsAt)).replace(",", "");
  }
  const range = formatTimeRange(startsAt, endsAt);
  return withDay ? `${formatCampusDay(new Date(startsAt), now)}, ${range}` : range;
}

/** Up to three faces for the avatar stack, and how many more there are. */
export function avatarStack(going: GoingPerson[] | undefined, max = 3) {
  const people = going ?? [];
  return {
    faces: people.slice(0, max).map((person) => ({
      userId: person.userId,
      initials: initialsOf(person.displayName),
      ...avatarColour(person.userId),
    })),
    more: Math.max(0, people.length - max),
  };
}

/** "Priya Raman" → "PR", "Moses" → "M", no name → "?". */
export function initialsOf(displayName: string | null | undefined): string {
  const words = (displayName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return formatInitial(displayName);
}

const AVATAR_PAIRS = [
  { bg: "#E8F0FE", fg: "#2F5BEA" },
  { bg: "#E6F6F6", fg: "#0F766E" },
  { bg: "#F0EBFE", fg: "#6D4AE8" },
  { bg: "#FFF1E6", fg: "#B4531F" },
  { bg: "#FDECEA", fg: "#C2352B" },
  { bg: "#E8F5EE", fg: "#1F7A50" },
];

/** A stable soft colour per person, so the same student looks the same everywhere. */
export function avatarColour(userId: string): { bg: string; fg: string } {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PAIRS[h % AVATAR_PAIRS.length];
}

/** `3 of 6 seats` -- taken of total, the way the design counts. */
export function seatsText(attendeeCount: number, capacity: number): string {
  return `${attendeeCount} of ${capacity} seats`;
}

/** Whole campus days from today, for grouping into board columns. */
export function boardColumn(startsAt: string, endsAt: string, now: Date): "now" | "today" | "tomorrow" | "later" {
  if (isInProgress(startsAt, endsAt, now)) return "now";
  const offset = campusDayOffset(new Date(startsAt), now);
  if (offset <= 0) return "today";
  if (offset === 1) return "tomorrow";
  return "later";
}

// ---------------------------------------------------------------------------
// The week calendar: where a session sits, in campus time
// ---------------------------------------------------------------------------

const clockParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Minutes since campus midnight, and the campus weekday (0 = Monday). */
export function campusClock(date: Date): { minutes: number; weekday: number } {
  const parts = clockParts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** First hour shown on the calendar, and the hour it ends (midnight). */
export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 24;

/**
 * Where a session goes in this week's grid: its column (0 = Monday) and its
 * top and height in minutes from the first hour shown, clipped to the grid.
 * Null when it falls outside this campus week.
 */
export function calendarSlot(
  startsAt: string,
  endsAt: string,
  now: Date,
): { column: number; top: number; height: number } | null {
  const start = new Date(startsAt);
  const startOffset = campusDayOffset(start, now);
  const today = campusClock(now).weekday;
  const column = today + startOffset;
  if (column < 0 || column > 6) return null;
  const startMin = campusClock(start).minutes;
  const length = Math.max(30, (Date.parse(endsAt) - Date.parse(startsAt)) / 60000);
  const first = CALENDAR_START_HOUR * 60;
  const last = CALENDAR_END_HOUR * 60;
  const top = Math.max(0, startMin - first);
  const bottom = Math.min(last - first, startMin - first + length);
  if (bottom <= 0) return null;
  return { column, top, height: Math.max(24, bottom - top) };
}
