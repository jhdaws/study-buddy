// One session as an iCalendar file (US-19, docs/backlog.md).
//
// Pure and client-safe, like format.ts: no Supabase, no `server-only`, so
// ics.test.ts can hold it to the spec without a request. The Route Handler at
// src/app/sessions/[id]/calendar.ics/route.ts is the only caller.
//
// RFC 5545 is strict in four ways that are easy to miss, and a file that gets
// them wrong usually imports as *nothing at all* rather than as an error --
// which is why each one is a named function below with its own tests:
//
//   - lines end CRLF, never bare LF (§3.1);
//   - a line is at most 75 OCTETS, continued with a leading space (§3.1);
//   - backslash, semicolon, comma and newline are escaped in TEXT (§3.3.11);
//   - UTC timestamps are `YYYYMMDDTHHMMSSZ`, no dashes, colons or millis
//     (§3.3.5).
//
// Times go out as UTC instants, not campus local time. That is the opposite of
// format.ts, and deliberate: the calendar app renders in the reader's own zone,
// so a student travelling at the weekend still sees the session at the right
// moment. Nothing here should use CAMPUS_TIME_ZONE.

import { formatCourseCode } from "@/lib/format";
import type { SessionListItem } from "@/lib/sessions";

/** RFC 5545 §3.1: "Lines of text SHOULD NOT be longer than 75 octets". */
const MAX_LINE_OCTETS = 75;

const encoder = new TextEncoder();

/**
 * Escape a value for a TEXT property (§3.3.11).
 *
 * Backslash goes first, or it would escape the backslashes the later rules add.
 * Colon is NOT escaped: it is only special in a property's parameters, not in
 * its value, so escaping it would corrupt the URL in DESCRIPTION.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Fold one content line to the octet limit (§3.1).
 *
 * The limit counts UTF-8 octets, not characters, and the leading space of a
 * continuation line counts towards its 75 -- so a continuation carries 74
 * octets of content. Iterating the string with `for...of` walks whole code
 * points, so an accented letter or an emoji is never split down the middle,
 * which would make the line invalid UTF-8.
 */
export function foldIcsLine(line: string): string {
  const pieces: string[] = [];
  let current = "";
  let octets = 0;
  let budget = MAX_LINE_OCTETS;

  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > budget) {
      pieces.push(current);
      current = "";
      octets = 0;
      // Every line after the first spends one octet on its leading space.
      budget = MAX_LINE_OCTETS - 1;
    }
    current += character;
    octets += size;
  }
  pieces.push(current);

  return pieces.join("\r\n ");
}

/** An ISO instant as a UTC date-time value: `2026-10-01T19:30:00.000Z` -> `20261001T193000Z`. */
export function toIcsUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Not a date this calendar file can use: ${iso}`);
  }
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
}

export type SessionIcsOptions = {
  /** Absolute URL of the session page -- the file is useless without it. */
  sessionUrl: string;
  /** DTSTAMP, when the file was produced. Passed in so tests are deterministic. */
  now: Date;
};

/**
 * The session as a one-event calendar, ready to serve as `text/calendar`.
 *
 * The UID is derived from the session id and never changes, so a student who
 * downloads the file twice -- or after the host edits the session (US-09) --
 * gets the same event updated in place rather than a duplicate.
 */
export function buildSessionIcs(
  session: SessionListItem,
  { sessionUrl, now }: SessionIcsOptions,
): string {
  const summary = `${formatCourseCode(session.course)} · ${session.topic}`;
  const location = session.room
    ? `${session.locationLabel}, ${session.room}`
    : session.locationLabel;

  const description = [
    // null means the host deleted their account (SessionListItem.hostDisplayName).
    session.hostDisplayName ? `Hosted by ${session.hostDisplayName}.` : null,
    session.course.title,
    `Details: ${sessionUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Study Buddy//Study Buddy//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${session.id}@study-buddy`,
    `DTSTAMP:${toIcsUtc(now.toISOString())}`,
    `DTSTART:${toIcsUtc(session.startsAt)}`,
    `DTEND:${toIcsUtc(session.endsAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    // URL takes a URI, not TEXT, so it is folded but never escaped: a comma in
    // a URI is part of the address.
    `URL:${sessionUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // A trailing CRLF: the last line needs its terminator like any other.
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

/** Longer than this and the name is unreadable in a downloads list anyway. */
const MAX_SLUG_LENGTH = 60;

/**
 * A download name like `cs-3251-dynamic-programming.ics`.
 *
 * ASCII only, by construction: the name goes into a Content-Disposition
 * header, where a raw `"` or a non-ASCII byte would need encoding rules this
 * does not need to know about.
 */
export function icsFileName(session: SessionListItem): string {
  const slug = `${formatCourseCode(session.course)} ${session.topic}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, "");

  return `${slug || "session"}.ics`;
}
