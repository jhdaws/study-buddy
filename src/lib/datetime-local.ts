// Converting between `<input type="datetime-local">` values and the ISO
// instants createSessionSchema requires. BROWSER-SIDE: both functions read
// the time zone of whatever runs them, which is the point -- the browser knows
// the student's zone and the server (UTC on Vercel) does not.
//
// Why the form cannot submit the datetime-local value directly: it has no
// time zone (`2026-10-01T14:30`), so the schema rejects it on purpose
// (instant() in src/lib/validation.ts; docs/contracts.md, "Times in").
//
// Parsed by hand rather than with `new Date(value)`: older Safari read an
// offset-less date-time string as UTC, which is exactly the bug this exists
// to prevent.

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * `2026-10-01T14:30` (read in this runtime's local zone) ->
 * `2026-10-01T19:30:00.000Z`. Returns "" for a blank or malformed value, so
 * the schema reports the field as missing rather than malformed.
 */
export function localInputToIso(local: string): string {
  const match = LOCAL_INPUT.exec(local.trim());
  if (!match) return "";
  const [, year, month, day, hour, minute, second = "0", ms = "0"] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(ms.padEnd(3, "0")),
  );
  // new Date() rolls 2026-02-30 over to March; treat that as malformed.
  if (Number.isNaN(date.getTime()) || date.getDate() !== Number(day)) return "";
  return date.toISOString();
}

/**
 * An ISO instant -> the `datetime-local` value showing it in this runtime's
 * local zone, to minute precision. Returns "" for anything unparseable. Used
 * to refill the visible inputs from `FormState.values` after a failed submit.
 */
export function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
