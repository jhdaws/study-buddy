// The host form's "When" control (2026-10-20 redesign): pick a day from this
// week (or any later date), a start time and a length, instead of typing two
// date-times. Pure and client-safe; unit tested.
//
// Everything is campus time (Nashville), like every time the app shows. The
// form still submits two ISO instants, `startsAt` and `endsAt`, exactly as
// createSessionSchema expects; this module only turns picks into them and
// back.

import { CAMPUS_TIME_ZONE } from "@/lib/env";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime-local";

/** Session lengths offered, in minutes. */
export const LENGTHS = [60, 90, 120, 180] as const;
export const DEFAULT_LENGTH = 120;

/** "1 h", "1.5 h", "2 h". */
export function formatLength(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
});

/** `YYYY-MM-DD` for the campus day `instant` falls on, with its weekday. */
function campusDate(instant: number): { date: string; weekday: string; day: string } {
  const parts = dayParts.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    day: String(Number(get("day"))),
  };
}

export type DayChoice = {
  /** `YYYY-MM-DD`, campus time. */
  date: string;
  /** "Today", or a short weekday: "Wed". */
  label: string;
  /** Day of the month: "22". */
  day: string;
};

/** Today and the next `count - 1` campus days. Noon steps dodge DST edges. */
export function nextDays(now: Date, count = 7): DayChoice[] {
  const today = campusDate(now.getTime());
  // Noon on today's campus date, as an instant, then whole days from there.
  const noon = Date.parse(localInputToIso(`${today.date}T12:00`));
  return Array.from({ length: count }, (_, i) => {
    const d = campusDate(noon + i * 86_400_000);
    return { date: d.date, label: i === 0 ? "Today" : d.weekday, day: d.day };
  });
}

/** The ISO instants the form submits, or empty strings while incomplete. */
export function whenToIso(date: string, time: string, minutes: number): { startsAt: string; endsAt: string } {
  if (!date || !time || !minutes) return { startsAt: "", endsAt: "" };
  const startsAt = localInputToIso(`${date}T${time}`);
  if (!startsAt) return { startsAt: "", endsAt: "" };
  const endsAt = new Date(Date.parse(startsAt) + minutes * 60_000).toISOString();
  return { startsAt, endsAt };
}

/** Back from two instants (a failed submit's values) to the picks. */
export function isoToWhen(startsAt?: string, endsAt?: string): { date: string; time: string; minutes: number } {
  const local = isoToLocalInput(startsAt);
  if (!local) return { date: "", time: "", minutes: DEFAULT_LENGTH };
  const [date, time] = local.split("T");
  const minutes =
    startsAt && endsAt && !Number.isNaN(Date.parse(endsAt))
      ? Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)
      : DEFAULT_LENGTH;
  return { date, time: time.slice(0, 5), minutes: minutes > 0 ? minutes : DEFAULT_LENGTH };
}

const clock = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "Ends 9:00 PM" for the Length hint, or "" while incomplete. */
export function endsHint(date: string, time: string, minutes: number): string {
  const { endsAt } = whenToIso(date, time, minutes);
  return endsAt ? `Ends ${clock.format(new Date(endsAt)).replace(/[  ]/g, " ")}` : "";
}

/**
 * The first half-hour after now plus a little lead time, as `HH:MM`, for the
 * start time's starting value when hosting today.
 */
export function suggestedStart(now: Date): string {
  const local = isoToLocalInput(new Date(now.getTime() + 45 * 60_000).toISOString());
  const [h, m] = local.split("T")[1].split(":").map(Number);
  // Up to the next half hour, and no later than 11:30 PM.
  const minutes = Math.min(Math.ceil((h * 60 + m) / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
