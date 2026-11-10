// The numeric limits behind the form rules, in a module with NO imports.
//
// src/lib/validation.ts uses these and re-exports them, so
// `import { MIN_CAPACITY } from "@/lib/validation"` still works on the
// server and in tests. CLIENT COMPONENTS SHOULD IMPORT FROM HERE instead:
// validation.ts imports zod, and zod's `z` namespace drags every one of its
// locales into the browser bundle with it -- a 405 KB client chunk (95 KB
// gzipped) for the create-session page in W5's first build. A form that
// only needs a `maxLength` should not pay that.
//
// Moved out of validation.ts by W5 (#12); the names and values are W4's and
// part of the contract in docs/contracts.md. Keep this file dependency-free.

/**
 * The one-time sign-in code in the email (A3): digits only, 6 to 10 of them.
 * Supabase's "Email OTP Length" setting can be anything in that range
 * (`auth.email.otp_length` in config.toml, 6 locally; the hosted project's
 * is a dashboard setting, and some hosted projects default to 8). Accepting
 * the whole range means the form never refuses a real code because someone
 * changed that setting.
 */
export const OTP_CODE_MIN_LENGTH = 6;
export const OTP_CODE_MAX_LENGTH = 10;

/**
 * Passwords (A6): what the set-password form asks for. The real enforcement
 * is Supabase Auth's "Minimum password length" -- `auth.minimum_password_length`
 * in config.toml, and a dashboard setting on the hosted project
 * (supabase/README.md). Keep all three at 8. 72 is bcrypt's limit: Supabase
 * would silently ignore anything past it.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;

/** A2/A4: mirror as a CHECK on profiles.display_name (1..50 after trimming). */
export const DISPLAY_NAME_MAX_LENGTH = 50;

// Length caps keep a pasted essay out of the database. They are sanity
// limits, not product rules, mirrored as CHECKs on `sessions` in
// *_session_text_limits.sql so a direct API call cannot skip them.
export const TOPIC_MAX_LENGTH = 120;
export const LOCATION_LABEL_MAX_LENGTH = 100;
export const ROOM_MAX_LENGTH = 50;

/**
 * S2: a department code after normalisation (letters and digits only). The
 * longest real one is 7 (`INDS-NYC` -> `INDSNYC`, data/README.md); 10 leaves
 * room without letting a pasted sentence become a department. Mirrored as
 * `departments_code_length` in *_session_text_limits.sql.
 */
export const DEPARTMENT_CODE_MAX_LENGTH = 10;

/** The host counts as one (ADR 0008 rule 2). S1: `CHECK (capacity >= 2)`. */
export const MIN_CAPACITY = 2;

/**
 * The top of Postgres's `integer` range -- not a product maximum. There is
 * none (ADR 0008 rule 2); this only stops a huge number reaching the database
 * as a raw out-of-range error.
 */
export const MAX_CAPACITY = 2_147_483_647;

/**
 * R1/US-16: the optional note on a study request ("Tue or Wed evening would
 * suit me"). A request is a nudge, not a post -- 200 is roughly two lines on
 * a phone, which is as much as the list can show without burying the count.
 * Mirrored as `study_requests_note_length` in *_r1_study_requests.sql.
 */
export const STUDY_REQUEST_NOTE_MAX_LENGTH = 200;

/**
 * How long a study request stays live. Set by the BEFORE INSERT trigger in
 * *_r1_study_requests.sql, which is the only writer -- this constant is for
 * the copy ("asks expire after 7 days") and the tests, NOT a second source of
 * truth. Change both together.
 */
export const STUDY_REQUEST_DAYS = 7;

/**
 * How far in the past a start time may be and still count as "now".
 * `datetime-local` inputs have minute precision, so a host who picks the
 * current minute is already up to 59 seconds late by the time they submit.
 * S1: create_session should allow the same slack (`starts_at >= now() -
 * interval '5 minutes'`) or the database will reject what this accepts.
 */
export const START_GRACE_MINUTES = 5;

/**
 * How long the Supabase auth cookies last on a device, in seconds (SEC-16,
 * US-21). @supabase/ssr's default is 400 days, so a laptop left signed in
 * stayed signed in for over a year. The cookies are rewritten whenever the
 * session is refreshed, which happens on every visit after the hourly access
 * token expires, so this is an inactivity limit: a device unused for 7 days
 * is signed out; one in use is not.
 *
 * It does not end a stolen refresh token, which stays valid at Supabase
 * until signed out. That needs Supabase's session time-box
 * (`[auth.sessions]` in config.toml), a paid-plan feature.
 */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/** The cookie options every Supabase client in the app passes. */
export const SUPABASE_COOKIE_OPTIONS = { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS } as const;

/**
 * US-11: the academic profile. Major and minor are optional free text, 1 to
 * 80 characters after trimming (blank is saved as null); mirrored as
 * `profiles_major_check` and `profiles_minor_check` in
 * *_academic_profile.sql. 80 fits a double major written out in full.
 */
export const MAJOR_MAX_LENGTH = 80;
export const MINOR_MAX_LENGTH = 80;

/**
 * US-11: the most current courses one profile lists. A sanity limit (a
 * full-time load is four to six), enforced by the `profile_courses_limit`
 * trigger in *_academic_profile.sql. Change one, change the other.
 */
export const PROFILE_COURSES_MAX = 8;
