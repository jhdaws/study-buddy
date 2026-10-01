// Validation schemas shared by forms and the server actions behind them.
//
// Owner: Track W. Used by A3/A4 (sign-in, display name), S3 (createSession)
// and W5 (the forms). A schema here is part of the contract in
// docs/contracts.md: renaming a field or changing an output type breaks the
// form and the action together.
//
// These rules mirror the database's. The database is the real enforcement
// point -- S1's CHECKs and create_session, A2's signup trigger -- and this
// layer exists to give a good, field-level message before the round trip.
// When you add a rule here, make sure the database has it too, and the other
// way round.
//
// FORM FIELD NAMES ARE THE SCHEMA KEYS. Each <input name="..."> must match a
// key exactly: the action parses Object.fromEntries(formData) and hands the
// field errors back under the same names.
//
// Client-safe: nothing here may import server-only code. But importing it
// ships zod, every locale included, to the browser: a Client Component that
// only needs a length for `maxLength` should import it from @/lib/limits,
// where the constants live. They are re-exported below unchanged.

import { z } from "zod";

import { ALLOWED_EMAIL_DOMAIN } from "@/lib/env";
import {
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_LABEL_MAX_LENGTH,
  MAX_CAPACITY,
  MIN_CAPACITY,
  ROOM_MAX_LENGTH,
  START_GRACE_MINUTES,
  TOPIC_MAX_LENGTH,
} from "@/lib/limits";

// The limits are part of this module's contract (docs/contracts.md); they
// live in limits.ts so Client Components can have them without zod.
export {
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_LABEL_MAX_LENGTH,
  MAX_CAPACITY,
  MIN_CAPACITY,
  ROOM_MAX_LENGTH,
  START_GRACE_MINUTES,
  TOPIC_MAX_LENGTH,
};

// ---------------------------------------------------------------------------
// Form state -- what an action returns to useActionState when it does not
// redirect. Shared by every form so they all render errors the same way.
// ---------------------------------------------------------------------------

/** Messages per form field, keyed by field name. Show the first. */
export type FieldErrors<Field extends string> = Partial<Record<Field, string[]>>;

/**
 * - `fieldErrors`: render next to each input (`aria-describedby`, `role="alert"`).
 * - `formError`: one message about the submission as a whole. Never raw
 *   database text -- map it through `src/lib/errors.ts`.
 * - `values`: what was submitted, as strings. React 19 resets the form when
 *   its action finishes -- including when the action returns validation
 *   errors -- so feed these back as `defaultValue`, or the student retypes
 *   everything. **`<select>` is the exception:** React applies a select's
 *   `defaultValue` only on mount, so the reset puts it back to its first
 *   option even when `defaultValue` has changed. Give it
 *   `key={values?.field}` as well, so it remounts with the submitted value.
 *   (Controlled selects are reset too. Both checked in jsdom with React
 *   19.2; see LocationPicker.tsx for the workaround it uses.)
 */
export type FormState<Field extends string> = {
  fieldErrors?: FieldErrors<Field>;
  formError?: string;
  values?: Partial<Record<Field, string>>;
};

/** The submitted string values, for `FormState.values`. Files are dropped. */
export function formValues<Field extends string>(
  formData: FormData,
): Partial<Record<Field, string>> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    // React adds $ACTION_* entries of its own to every action submission.
    if (typeof value === "string" && !key.startsWith("$ACTION")) {
      values[key] = value;
    }
  }
  return values as Partial<Record<Field, string>>;
}

/** The state to return when `safeParse` fails. */
export function invalidFormState<Values extends Record<string, unknown>>(
  error: z.ZodError<Values>,
  formData: FormData,
): FormState<Extract<keyof Values, string>> {
  const { formErrors, fieldErrors } = z.flattenError(error);
  return {
    fieldErrors: fieldErrors as FieldErrors<Extract<keyof Values, string>>,
    formError: formErrors[0],
    values: formValues(formData),
  };
}

// ---------------------------------------------------------------------------
// Sign-in (US-01) -- A3 calls this in signIn().
// ---------------------------------------------------------------------------

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1);
}

/**
 * A Vanderbilt email address. Trimmed and lowercased, so `Name@Vanderbilt.EDU`
 * is accepted and comes out as `name@vanderbilt.edu`. The domain must match
 * exactly: subdomains (`@mail.vanderbilt.edu`) are rejected.
 *
 * For the message only -- A2's signup trigger is what actually refuses
 * other domains (US-01b).
 */
export const signInSchema = z.object({
  email: z
    .string({ error: "Enter your Vanderbilt email address." })
    .trim()
    .toLowerCase()
    .min(1, { error: "Enter your Vanderbilt email address." })
    .pipe(z.email({ error: "Enter a valid email address." }))
    .refine((email) => domainOf(email) === ALLOWED_EMAIL_DOMAIN, {
      error: `Use your @${ALLOWED_EMAIL_DOMAIN} email address.`,
      // Only once the address is well formed: one message at a time.
      when: (payload) => payload.issues.length === 0,
    }),
});

export type SignInValues = z.output<typeof signInSchema>;
export type SignInField = keyof SignInValues;

// ---------------------------------------------------------------------------
// Display name (US-01, ADR 0008 rule 1) -- A4 calls this in saveDisplayName().
// ---------------------------------------------------------------------------

// DISPLAY_NAME_MAX_LENGTH: see src/lib/limits.ts.

export const displayNameSchema = z.object({
  displayName: z
    .string({ error: "Enter a display name." })
    .trim()
    .min(1, { error: "Enter a display name." })
    .max(DISPLAY_NAME_MAX_LENGTH, {
      error: `Keep it to ${DISPLAY_NAME_MAX_LENGTH} characters or fewer.`,
    }),
});

export type DisplayNameValues = z.output<typeof displayNameSchema>;
export type DisplayNameField = keyof DisplayNameValues;

// ---------------------------------------------------------------------------
// Create a session (US-02, US-02b) -- S3 calls this in createSession().
// ---------------------------------------------------------------------------

// TOPIC_MAX_LENGTH, LOCATION_LABEL_MAX_LENGTH, ROOM_MAX_LENGTH, MIN_CAPACITY,
// MAX_CAPACITY and START_GRACE_MINUTES -- what each is for, and what S1 must
// mirror: see src/lib/limits.ts.

/**
 * An absolute instant, as ISO 8601 **with** a UTC offset or `Z`, parsed to a
 * `Date`.
 *
 * A bare `datetime-local` value (`2026-10-01T14:30`) is REJECTED on purpose:
 * it has no time zone, and the server (UTC on Vercel) would read it as a time
 * five or six hours away from what the student meant. The form converts it
 * first, reading it as campus time (localInputToIso in
 * src/lib/datetime-local.ts).
 */
function instant(message: string) {
  return z.iso
    .datetime({ offset: true, error: message })
    .transform((value) => new Date(value));
}

/**
 * Blank numeric inputs arrive as "" -- treat them as missing, so the message
 * says "enter a number" rather than complaining about zero.
 */
function blankAsMissing(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

// ---------------------------------------------------------------------------
// Department and course normalisation (S2, #19; US-02). The SQL twin lives in
// supabase/migrations/20261001031739_s2_course_normalization.sql --
// normalize_department_code and normalize_course_number must stay in
// lockstep with these, or a course the form thinks is new collides with one
// the database already has.
//
// Format verified against the 2026-27 undergraduate catalogue
// (data/README.md "For S2"): course numbers are four digits, optionally
// followed by one uppercase letter (`3251`, `2100W`, `1601L`); the suffix is
// part of the number, so it is never stripped. Department codes are
// uppercase letters and digits -- the six hyphenated exceptions
// (`PSY-PC` and siblings) collapse to their letters, a named, accepted risk
// (ADR 0008), and none is seeded.
// ---------------------------------------------------------------------------

/** `cs`, ` CS `, `C.S.` -> `CS`. Strips everything but letters and digits. */
export function normalizeDepartmentCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** `cs-3251`, ` 3251 `, `3251w` -> `3251`, `3251`, `3251W`. */
export function normalizeCourseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Four digits, optionally followed by one uppercase letter -- data/README.md. */
const COURSE_NUMBER_PATTERN = /^[0-9]{4}[A-Z]?$/;

/**
 * The create-session form. A factory so "now" is injectable: the start-time
 * rule depends on the clock, and tests pass a fixed one. Call it per request
 * -- `createSessionSchema().safeParse(...)` -- never once at module load, or
 * "now" freezes at server start.
 *
 * Output: strings trimmed; `room` is `null` when blank; `startsAt`/`endsAt`
 * are `Date`s; `capacity` is an integer.
 *
 * Department and course numbers are normalised here (S2, #19) the same way
 * the database does (see the SQL twin, named above).
 */
export function createSessionSchema(now: Date = new Date()) {
  const earliestStart = new Date(now.getTime() - START_GRACE_MINUTES * 60_000);

  return z
    .object({
      departmentCode: z
        .string({ error: "Choose or add a department." })
        .trim()
        .min(1, { error: "Choose or add a department." })
        .transform(normalizeDepartmentCode)
        .refine((value) => value.length > 0, {
          error: "Choose or add a department.",
        }),
      courseNumber: z
        .string({ error: "Enter a course number." })
        .trim()
        .min(1, { error: "Enter a course number." })
        .transform(normalizeCourseNumber)
        .refine((value) => COURSE_NUMBER_PATTERN.test(value), {
          error: "Enter a 4-digit course number, like 3251 or 2100W.",
        }),
      topic: z
        .string({ error: "Say what you'll be studying." })
        .trim()
        .min(1, { error: "Say what you'll be studying." })
        .max(TOPIC_MAX_LENGTH, {
          error: `Keep the topic to ${TOPIC_MAX_LENGTH} characters or fewer.`,
        }),
      // Optional: meaningful in a building, not in a cafe.
      room: z
        .string()
        .trim()
        .max(ROOM_MAX_LENGTH, {
          error: `Keep the room to ${ROOM_MAX_LENGTH} characters or fewer.`,
        })
        .optional()
        .transform((room) => room || null),
      // A Google Places place ID from <LocationPicker>. Never coordinates: the
      // server looks the place up itself (resolvePlace, M3).
      placeId: z
        .string({ error: "Choose a location." })
        .trim()
        .min(1, { error: "Choose a location." }),
      // The host's own words, prefilled from the picker (ADR 0008 rule 14).
      locationLabel: z
        .string({ error: "Give the location a name." })
        .trim()
        .min(1, { error: "Give the location a name." })
        .max(LOCATION_LABEL_MAX_LENGTH, {
          error: `Keep the location name to ${LOCATION_LABEL_MAX_LENGTH} characters or fewer.`,
        }),
      startsAt: instant("Choose a start time.").refine(
        (startsAt) => startsAt >= earliestStart,
        { error: "The start time has already passed." },
      ),
      endsAt: instant("Choose an end time."),
      capacity: z.preprocess(
        blankAsMissing,
        z.coerce
          .number({ error: "Enter how many people can come, including you." })
          .int({ error: "Enter a whole number." })
          .min(MIN_CAPACITY, {
            error: `At least ${MIN_CAPACITY} — you count as one.`,
          })
          .max(MAX_CAPACITY, { error: "That's more seats than we can store." }),
      ),
    })
    .refine((session) => session.endsAt > session.startsAt, {
      path: ["endsAt"],
      error: "The end time must be after the start time.",
      // Runs even when other fields failed, so every error shows on the first
      // submit -- as long as both times parsed. A time that failed to parse is
      // still the submitted string, not a Date. A start that parsed but is in
      // the past is still a Date, so "in the past" and "end before start" can
      // both show at once.
      when: (payload) => {
        const value = payload.value as { startsAt?: unknown; endsAt?: unknown };
        return value?.startsAt instanceof Date && value?.endsAt instanceof Date;
      },
    });
}

export type CreateSessionSchema = ReturnType<typeof createSessionSchema>;
export type CreateSessionValues = z.output<CreateSessionSchema>;
export type CreateSessionField = keyof CreateSessionValues;
