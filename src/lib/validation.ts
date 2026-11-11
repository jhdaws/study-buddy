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

import { CLASS_YEARS } from "@/lib/academic";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/env";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  DEPARTMENT_CODE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_LABEL_MAX_LENGTH,
  MAJOR_MAX_LENGTH,
  MAX_CAPACITY,
  MAX_REPEAT_WEEKS,
  MIN_CAPACITY,
  MINOR_MAX_LENGTH,
  MIN_REPEAT_WEEKS,
  OTP_CODE_MAX_LENGTH,
  OTP_CODE_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_COURSES_MAX,
  REPORT_NOTE_MAX_LENGTH,
  ROOM_MAX_LENGTH,
  START_GRACE_MINUTES,
  STUDY_REQUEST_NOTE_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from "@/lib/limits";
import { REPORT_REASONS } from "@/lib/reports";

// The limits are part of this module's contract (docs/contracts.md); they
// live in limits.ts so Client Components can have them without zod.
export {
  CHAT_MESSAGE_MAX_LENGTH,
  DEPARTMENT_CODE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_LABEL_MAX_LENGTH,
  MAJOR_MAX_LENGTH,
  MAX_CAPACITY,
  MAX_REPEAT_WEEKS,
  MIN_CAPACITY,
  MINOR_MAX_LENGTH,
  MIN_REPEAT_WEEKS,
  OTP_CODE_MAX_LENGTH,
  OTP_CODE_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_COURSES_MAX,
  REPORT_NOTE_MAX_LENGTH,
  ROOM_MAX_LENGTH,
  START_GRACE_MINUTES,
  STUDY_REQUEST_NOTE_MAX_LENGTH,
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
// The one-time code from the sign-in email (US-01) -- A3 calls this in
// verifyCode(). The same email carries a link too; why both is at
// verifyCode() in src/app/login/actions.ts.
// ---------------------------------------------------------------------------

const CODE_MESSAGE = "Enter the code from the email — digits only.";

/**
 * The address the code was sent to (a hidden field, re-checked with
 * signInSchema's rule) and the code. Spaces and hyphens are dropped, so a
 * code pasted as `123 456` or `123-456` still works; what is left must be
 * OTP_CODE_MIN_LENGTH to OTP_CODE_MAX_LENGTH digits.
 */
export const verifyCodeSchema = z.object({
  email: signInSchema.shape.email,
  code: z
    .string({ error: "Enter the code from the email." })
    .transform((code) => code.replace(/[\s-]/g, ""))
    .pipe(
      z
        .string()
        .min(1, { error: "Enter the code from the email." })
        .regex(/^\d+$/, { error: CODE_MESSAGE })
        .min(OTP_CODE_MIN_LENGTH, { error: CODE_MESSAGE })
        .max(OTP_CODE_MAX_LENGTH, { error: CODE_MESSAGE }),
    ),
});

export type VerifyCodeValues = z.output<typeof verifyCodeSchema>;
export type VerifyCodeField = keyof VerifyCodeValues;

// ---------------------------------------------------------------------------
// Passwords (US-01, A6). A returning student signs in with their email and
// password -- no email sent. They choose the password after their first
// sign-in by code, and again after "forgot my password".
// ---------------------------------------------------------------------------

/**
 * Sign in with a password. Only "is anything there" is checked: telling a
 * student their password is too short for the rules would describe the
 * rules, not their mistake, and Supabase decides whether it matches.
 */
export const passwordSignInSchema = z.object({
  email: signInSchema.shape.email,
  password: z
    .string({ error: "Enter your password." })
    .min(1, { error: "Enter your password." }),
});

export type PasswordSignInValues = z.output<typeof passwordSignInSchema>;
export type PasswordSignInField = keyof PasswordSignInValues;

/**
 * Choose a password: PASSWORD_MIN_LENGTH to PASSWORD_MAX_LENGTH characters,
 * typed twice. Not trimmed -- a space is a character like any other, and
 * trimming one would set a password the student did not type.
 */
export const setPasswordSchema = z
  .object({
    password: z
      .string({ error: "Choose a password." })
      .min(1, { error: "Choose a password." })
      .min(PASSWORD_MIN_LENGTH, {
        error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      })
      .max(PASSWORD_MAX_LENGTH, {
        error: `Keep it to ${PASSWORD_MAX_LENGTH} characters or fewer.`,
      }),
    confirmPassword: z.string({ error: "Type the password again." }),
  })
  .refine((values) => values.confirmPassword === values.password, {
    error: "The two passwords don't match.",
    path: ["confirmPassword"],
    when: (payload) => payload.issues.length === 0,
  });

export type SetPasswordValues = z.output<typeof setPasswordSchema>;
export type SetPasswordField = keyof SetPasswordValues;

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

/**
 * ` 3251 `, `3251w`, `2100-W` -> `3251`, `3251W`, `2100W`. A department
 * prefix is kept (`cs-3251` -> `CS3251`), so it fails the format check below.
 */
export function normalizeCourseNumber(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Four digits, optionally followed by one uppercase letter -- data/README.md. */
const COURSE_NUMBER_PATTERN = /^[0-9]{4}[A-Z]?$/;

// Which course, as two fields. Shared by the create-session form and the
// study-request form (US-16) so the normalisation cannot drift between them:
// both end up at the same get_or_create_course, and a request normalised
// differently would ask for a course no session could ever match.

const departmentCodeField = z
  .string({ error: "Choose or add a department." })
  .trim()
  .min(1, { error: "Choose or add a department." })
  .transform(normalizeDepartmentCode)
  .refine((value) => value.length > 0, {
    error: "Choose or add a department.",
  })
  .refine((value) => value.length <= DEPARTMENT_CODE_MAX_LENGTH, {
    error: `Department codes are at most ${DEPARTMENT_CODE_MAX_LENGTH} letters or digits.`,
  });

const courseNumberField = z
  .string({ error: "Enter a course number." })
  .trim()
  .min(1, { error: "Enter a course number." })
  .transform(normalizeCourseNumber)
  .refine((value) => COURSE_NUMBER_PATTERN.test(value), {
    error: "Enter a 4-digit course number, like 3251 or 2100W.",
  });

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
export function createSessionSchema(
  now: Date = new Date(),
  options: { unchangedStart?: Date } = {},
) {
  const earliestStart = new Date(now.getTime() - START_GRACE_MINUTES * 60_000);

  return z
    .object({
      departmentCode: departmentCodeField,
      courseNumber: courseNumberField,
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
      // The Autocomplete session token the picker used to find that place
      // (M2), for resolvePlace() to close Google's billing session with.
      // Optional -- the fixture picker has none -- and never an error: a
      // missing or malformed token only affects billing, so anything that is
      // not a non-blank string becomes undefined, and resolvePlace() drops a
      // token Google would reject.
      placeSessionToken: z
        .string()
        .trim()
        .optional()
        .transform((token) => token || undefined)
        .catch(undefined),
      // The host's own words, prefilled from the picker (ADR 0008 rule 14).
      locationLabel: z
        .string({ error: "Give the location a name." })
        .trim()
        .min(1, { error: "Give the location a name." })
        .max(LOCATION_LABEL_MAX_LENGTH, {
          error: `Keep the location name to ${LOCATION_LABEL_MAX_LENGTH} characters or fewer.`,
        }),
      startsAt: instant("Choose a start time.").refine(
        (startsAt) =>
          startsAt >= earliestStart ||
          // S7/US-09: an edit that leaves the start alone is allowed even once
          // it has passed, so a host can fix the topic or room of a session
          // already in progress. update_session() makes the same allowance,
          // comparing against the STORED start.
          startsAt.getTime() === options.unchangedStart?.getTime(),
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
      // US-20: a checked box posts "on"; an unchecked box posts nothing. The
      // edit form does not render these fields at all, so both stay at their
      // "not repeating" defaults there.
      repeatWeekly: z
        .string()
        .optional()
        .transform((value) => value === "on" || value === "true"),
      // Only meaningful when repeatWeekly is true; ignored otherwise. The
      // refine below is what demands it then -- making it required here would
      // refuse every ordinary (non-repeat) create.
      weeks: z.preprocess(
        blankAsMissing,
        z.coerce
          .number({ error: `Choose ${MIN_REPEAT_WEEKS} to ${MAX_REPEAT_WEEKS} weeks.` })
          .int({ error: "Enter a whole number of weeks." })
          .min(MIN_REPEAT_WEEKS, {
            error: `Repeat for at least ${MIN_REPEAT_WEEKS} weeks.`,
          })
          .max(MAX_REPEAT_WEEKS, {
            error: `Repeat for at most ${MAX_REPEAT_WEEKS} weeks.`,
          })
          .optional(),
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
    })
    .refine((session) => !session.repeatWeekly || session.weeks != null, {
      path: ["weeks"],
      error: `Choose ${MIN_REPEAT_WEEKS} to ${MAX_REPEAT_WEEKS} weeks.`,
    });
}

export type CreateSessionSchema = ReturnType<typeof createSessionSchema>;
export type CreateSessionValues = z.output<CreateSessionSchema>;
export type CreateSessionField = keyof CreateSessionValues;

// ---------------------------------------------------------------------------
// Edit a session (US-09) -- S7 calls this in updateSession().
// ---------------------------------------------------------------------------

/**
 * The edit-session form: the same fields and the same rules as creating one,
 * because a host editing a session may not leave it in a state they could not
 * have created. Deliberately the same schema rather than a parallel copy --
 * two sets of rules for one table drift, and the database only has one.
 *
 * `unchangedStart` is the session's stored start time. Passing it allows a
 * start that has already passed **only if the host did not move it**, which is
 * what update_session() allows too: see the note on `startsAt` above.
 */
export function editSessionSchema(unchangedStart: Date, now: Date = new Date()) {
  return createSessionSchema(now, { unchangedStart });
}

export type EditSessionSchema = ReturnType<typeof editSessionSchema>;
export type EditSessionValues = z.output<EditSessionSchema>;
export type EditSessionField = keyof EditSessionValues;

// ---------------------------------------------------------------------------
// Ask for a session (US-16, R1) -- requestSession() calls this.
//
// The create-session form's department and course rules, and nothing else. A
// request says WHICH COURSE and, optionally, why; it has no time, place or
// capacity, because a student who knew those would be hosting rather than
// asking.
// ---------------------------------------------------------------------------

export const studyRequestSchema = z.object({
  departmentCode: departmentCodeField,
  courseNumber: courseNumberField,
  // Optional, like `room`: null when blank, so the database stores null and
  // the UI tests one thing rather than two. The BEFORE INSERT trigger in
  // *_r1_study_requests.sql trims again -- that is the enforcement, this is
  // the message.
  note: z
    .string()
    .trim()
    .max(STUDY_REQUEST_NOTE_MAX_LENGTH, {
      error: `Keep it to ${STUDY_REQUEST_NOTE_MAX_LENGTH} characters or fewer.`,
    })
    .optional()
    .transform((note) => note || null),
});

export type StudyRequestValues = z.output<typeof studyRequestSchema>;
export type StudyRequestField = keyof StudyRequestValues;

// ---------------------------------------------------------------------------
// Academic profile (US-11) -- saveProfile() in src/app/profile/actions.ts.
// The database twins are profiles_major_check, profiles_minor_check, the
// class_year enum and the profile_courses_limit trigger
// (*_academic_profile.sql).
// ---------------------------------------------------------------------------

// MAJOR_MAX_LENGTH, MINOR_MAX_LENGTH, PROFILE_COURSES_MAX: src/lib/limits.ts.

/** Optional free text: trimmed, and blank becomes null -- never stored as "". */
function optionalText(max: number, tooLong: string) {
  return z
    .string()
    .trim()
    .max(max, { error: tooLong })
    .optional()
    .transform((text) => text || null);
}

/**
 * One current course as the form submits it: `CS 3251` -- the department,
 * a space, the number. Both halves are normalised as the session form's are,
 * so `cs 3251` and `C.S. 3251` are the same course.
 */
const profileCourseSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const space = raw.lastIndexOf(" ");
    const departmentCode = normalizeDepartmentCode(space < 0 ? "" : raw.slice(0, space));
    const courseNumber = normalizeCourseNumber(space < 0 ? raw : raw.slice(space + 1));
    if (departmentCode === "" || departmentCode.length > DEPARTMENT_CODE_MAX_LENGTH) {
      ctx.addIssue({ code: "custom", message: `Choose a department for ${raw || "each course"}.` });
      return z.NEVER;
    }
    if (!COURSE_NUMBER_PATTERN.test(courseNumber)) {
      ctx.addIssue({
        code: "custom",
        message: `“${raw}” isn't a course number. Use 4 digits, like 3251 or 2100W.`,
      });
      return z.NEVER;
    }
    return { departmentCode, courseNumber };
  });

export const profileSchema = z.object({
  major: optionalText(MAJOR_MAX_LENGTH, `Keep your major to ${MAJOR_MAX_LENGTH} characters or fewer.`),
  minor: optionalText(MINOR_MAX_LENGTH, `Keep your minor to ${MINOR_MAX_LENGTH} characters or fewer.`),
  // "" is the select's "Prefer not to say": no year.
  classYear: z
    .preprocess(
      blankAsMissing,
      z.enum(CLASS_YEARS, { error: "Choose your year from the list." }).optional(),
    )
    .transform((year) => year ?? null),
  // Repeats of one course collapse to one; the limit counts what is left.
  courses: z
    .array(profileCourseSchema)
    .default([])
    .transform((courses) => {
      const seen = new Set<string>();
      return courses.filter((course) => {
        const key = `${course.departmentCode} ${course.courseNumber}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .refine((courses) => courses.length <= PROFILE_COURSES_MAX, {
      error: `List up to ${PROFILE_COURSES_MAX} current courses.`,
    }),
});

export type ProfileValues = z.output<typeof profileSchema>;
export type ProfileField = keyof ProfileValues;

// ---------------------------------------------------------------------------
// Delete my account (US-24) -- deleteAccount() in src/app/account/actions.ts.
// ---------------------------------------------------------------------------

/**
 * The confirmation step: a checkbox, `confirm`, submitted as "yes" when
 * ticked (and absent when not). Nothing else is read from the form -- above
 * all, no user id: the account deleted is always the caller's own.
 */
export const deleteAccountSchema = z.object({
  confirm: z.literal("yes", {
    error: "Tick the box to confirm you want your account deleted.",
  }),
});

export type DeleteAccountValues = z.output<typeof deleteAccountSchema>;
export type DeleteAccountField = keyof DeleteAccountValues;

// ---------------------------------------------------------------------------
// Report a user (US-18) -- reportUser() in src/app/reports/actions.ts. The
// database twins: the report_reason enum, reports_note_length, and the
// reports_insert_own policy (*_reports.sql).
// ---------------------------------------------------------------------------

/** A uuid as Postgres prints one. Anything else cannot be a profile or session. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The report form: who (a hidden field, from the roster), the session it was
 * sent from (hidden, optional), a reason, and an optional note. Never who is
 * reporting: that is the signed-in student, set by the database.
 */
export const reportUserSchema = z.object({
  reportedUserId: z
    .string({ error: "Choose who you're reporting." })
    .regex(UUID_PATTERN, { error: "Choose who you're reporting." }),
  sessionId: z
    .string()
    .trim()
    .optional()
    .transform((id) => id || null)
    .refine((id) => id === null || UUID_PATTERN.test(id), { error: "That session isn't valid." }),
  reason: z.enum(REPORT_REASONS, { error: "Choose a reason." }),
  note: z
    .string()
    .trim()
    .max(REPORT_NOTE_MAX_LENGTH, {
      error: `Keep the note to ${REPORT_NOTE_MAX_LENGTH} characters or fewer.`,
    })
    .optional()
    .transform((note) => note || null),
});

export type ReportUserValues = z.output<typeof reportUserSchema>;
export type ReportUserField = keyof ReportUserValues;

// ---------------------------------------------------------------------------
// Session chat (US-05) -- sendMessage() in src/app/sessions/actions.ts. Its
// database twin: session_messages_body_check (*_session_chat.sql). Who sends
// it is never a field: the database fills author_id from the session.
// ---------------------------------------------------------------------------

export const chatMessageSchema = z.object({
  body: z
    .string({ error: "Write a message first." })
    .trim()
    .min(1, { error: "Write a message first." })
    .max(CHAT_MESSAGE_MAX_LENGTH, {
      error: `Keep messages to ${CHAT_MESSAGE_MAX_LENGTH} characters or fewer.`,
    }),
});

export type ChatMessageValues = z.output<typeof chatMessageSchema>;
export type ChatMessageField = keyof ChatMessageValues;
