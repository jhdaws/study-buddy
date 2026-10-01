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

/** A2/A4: mirror as a CHECK on profiles.display_name (1..50 after trimming). */
export const DISPLAY_NAME_MAX_LENGTH = 50;

// Length caps keep a pasted essay out of the database. They are the
// validation layer's sanity limits, not product rules; S1 may mirror them as
// CHECKs.
export const TOPIC_MAX_LENGTH = 120;
export const LOCATION_LABEL_MAX_LENGTH = 100;
export const ROOM_MAX_LENGTH = 50;

/** The host counts as one (ADR 0008 rule 2). S1: `CHECK (capacity >= 2)`. */
export const MIN_CAPACITY = 2;

/**
 * The top of Postgres's `integer` range -- not a product maximum. There is
 * none (ADR 0008 rule 2); this only stops a huge number reaching the database
 * as a raw out-of-range error.
 */
export const MAX_CAPACITY = 2_147_483_647;

/**
 * How far in the past a start time may be and still count as "now".
 * `datetime-local` inputs have minute precision, so a host who picks the
 * current minute is already up to 59 seconds late by the time they submit.
 * S1: create_session should allow the same slack (`starts_at >= now() -
 * interval '5 minutes'`) or the database will reject what this accepts.
 */
export const START_GRACE_MINUTES = 5;
