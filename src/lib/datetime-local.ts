// Converting between `<input type="datetime-local">` values and the ISO
// instants createSessionSchema requires.
//
// THE FORM'S TIMES ARE CAMPUS TIME, not the device's. "2:30 PM" typed into the
// form means 2:30 PM in Nashville, even on a laptop still set to another zone
// after a trip home -- the same zone the session list displays (format.ts).
// Both functions take the zone as a parameter, defaulting to CAMPUS_TIME_ZONE,
// and never read the runtime's own zone, so they give the same answer in a
// browser, on the server, and in CI.
//
// Why the form cannot submit the datetime-local value directly: it has no
// time zone (`2026-10-01T14:30`), so the schema rejects it on purpose
// (instant() in src/lib/validation.ts; docs/contracts.md, "Times in").
//
// Parsed by hand rather than with `new Date(value)`: `new Date` would read the
// value in the runtime's zone (and older Safari read it as UTC).

import { CAMPUS_TIME_ZONE } from "@/lib/env";

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const wallClockFormats = new Map<string, Intl.DateTimeFormat>();

function wallClockFormat(timeZone: string): Intl.DateTimeFormat {
  let format = wallClockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    wallClockFormats.set(timeZone, format);
  }
  return format;
}

/** The wall-clock reading of `instant` in `timeZone`, as numbers. */
function wallClock(instant: number, timeZone: string) {
  const parts: Record<string, number> = {};
  for (const { type, value } of wallClockFormat(timeZone).formatToParts(instant)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return parts as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

/** How far `timeZone` is ahead of UTC at `instant`, in ms (Chicago: -5h or -6h). */
function offsetAt(instant: number, timeZone: string): number {
  const c = wallClock(instant, timeZone);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  return asUtc - (instant - (((instant % 1000) + 1000) % 1000));
}

/**
 * `2026-10-01T14:30`, read as wall-clock time in `timeZone` ->
 * `2026-10-01T19:30:00.000Z`. Returns "" for a blank or malformed value, so
 * the schema reports the field as missing rather than malformed.
 *
 * Daylight-saving edges: a time that does not exist (2:30 AM on the spring
 * change) comes out an hour later, as browsers do; a time that happens twice
 * (1:30 AM on the autumn change) resolves to the first.
 */
export function localInputToIso(local: string, timeZone: string = CAMPUS_TIME_ZONE): string {
  const match = LOCAL_INPUT.exec(local.trim());
  if (!match) return "";
  const [, year, month, day, hour, minute, second = "0", ms = "0"] = match;
  const [y, mo, d, h, mi, s] = [year, month, day, hour, minute, second].map(Number);

  if (h > 23 || mi > 59 || s > 59) return "";
  // The typed reading as if it were UTC; Date.UTC rolls Feb 30 over to March,
  // so a changed day means the date does not exist.
  const naive = Date.UTC(y, mo - 1, d, h, mi, s, Number(ms.padEnd(3, "0")));
  if (Number.isNaN(naive) || new Date(naive).getUTCDate() !== d) return "";

  // Subtract the zone's offset. The offset depends on the instant we are
  // solving for, so try the offset at the naive guess and at the first
  // answer: near a daylight-saving change they differ, and only a candidate
  // whose wall clock reads back as what was typed is right.
  const first = naive - offsetAt(naive, timeZone);
  const candidates = [...new Set([first, naive - offsetAt(first, timeZone)])];
  const readsBack = candidates.filter((instant) => {
    const c = wallClock(instant, timeZone);
    return c.year === y && c.month === mo && c.day === d && c.hour === h && c.minute === mi;
  });
  const instant =
    readsBack.length > 0
      ? Math.min(...readsBack) // twice-occurring time: the first
      : Math.max(...candidates); // nonexistent time: an hour later
  return new Date(instant).toISOString();
}

/**
 * An ISO instant -> the `datetime-local` value showing it as wall-clock time
 * in `timeZone`, to minute precision. Returns "" for anything unparseable.
 * Used to refill the visible inputs from `FormState.values` after a failed
 * submit.
 */
export function isoToLocalInput(
  iso: string | undefined,
  timeZone: string = CAMPUS_TIME_ZONE,
): string {
  if (!iso) return "";
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return "";
  const c = wallClock(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${c.year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}`;
}
