// Maps database and auth errors onto messages a student should actually see.
//
// Never surface raw Postgres or Supabase Auth text to a user: it leaks schema
// names and reads like a crash. Add a mapping here instead.
//
// Pure functions on purpose: the failure paths that are awkward to reproduce
// against a live database are cheap to unit test (errors.test.ts).
//
// Mappings so far:
//   - A2/A3 (#15, #16): sign-in errors from Supabase Auth (sending a link or
//     code, and checking a code), and the profile rules from
//     supabase/migrations/*_profile_rules.sql.
//   - S1-S3 (#18-#20): what create_session and get_or_create_course raise,
//     and the CHECKs on sessions, departments and courses
//     (*_s1_session_rules.sql, *_s2_course_normalization.sql,
//     *_session_text_limits.sql).
//   - SEC-03: the per-student cap on new departments and courses
//     (*_catalogue_insert_limit.sql).
//   - S5: what join_session and leave_session raise
//     (*_join_leave_session.sql).
//   - S7 (US-09): what update_session and cancel_session raise
//     (*_s7_edit_cancel_session.sql). The CHECKs they can trip are S1's,
//     already mapped above -- an edit goes through the same constraints.
//   - M2 (#23): the location picker's searches, sent from the browser to
//     Places Autocomplete (src/lib/place-search.ts).
//   - R1 (US-16): the CHECK and the unique constraint on study_requests
//     (*_r1_study_requests.sql). Those writes go through RLS policies rather
//     than a SECURITY DEFINER function, so nothing there `raise exception`s:
//     a refusal arrives as 42501 (already mapped below) or as a constraint
//     name, which is why both new entries are in CONSTRAINT_MESSAGES.
//   - P1 (US-11): the academic profile's CHECKs and course limit
//     (*_academic_profile.sql).
//   - P2 (US-24): deleting an account through Supabase Auth's admin API.
//   - P3 (US-18): the reports table's limit and note check (*_reports.sql).
// Still to come:
//   - Later: chat (US-05).

import { CATALOGUE_INSERTS_PER_DAY, CATALOGUE_INSERTS_PER_HOUR } from "@/lib/limits";

/** For anything we have not mapped. Says nothing about the cause. */
export const GENERIC_ERROR_MESSAGE =
  "Something went wrong on our side. Try again in a moment.";

// ---------------------------------------------------------------------------
// Database errors -- PostgREST's error object: SQLSTATE in `code`, Postgres's
// text in `message` and `details`.
// ---------------------------------------------------------------------------

/** The fields we read from a PostgREST / Postgres error. */
export type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
};

/**
 * Named constraints, by name. Postgres puts the name in the message ("...
 * violates check constraint \"profiles_display_name_check\""); PostgREST
 * passes it on. Matched by name, so the wording of the message never matters.
 */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  // A2: 1-50 characters, trimmed (mirrors displayNameSchema).
  profiles_display_name_check:
    "Display names must be 1 to 50 characters, without spaces at either end.",
  // A2: the signup trigger. Reaches us only through a direct database call;
  // through Supabase Auth it arrives as an auth error (signInErrorMessage).
  auth_users_vanderbilt_email: "Use your @vanderbilt.edu email address.",
  // S1, S3: the session rules. Mirror createSessionSchema.
  sessions_ends_after_starts: "The session has to end after it starts.",
  sessions_capacity_min: "Capacity must be at least 2 — you count as one.",
  sessions_topic_length: "Keep the topic to 1 to 120 characters.",
  sessions_location_label_length: "Keep the location name to 1 to 100 characters.",
  sessions_room_length: "Keep the room to 50 characters or fewer.",
  // S2: departments and courses are stored normalised.
  departments_code_normalised: "That department code isn't valid.",
  departments_code_length: "Department codes are at most 10 letters or digits.",
  courses_number_normalised: "Enter a 4-digit course number, like 3251 or 2100W.",
  // P1 (US-11): mirror profileSchema.
  profiles_major_check: "Keep your major to 1 to 80 characters, without spaces at either end.",
  profiles_minor_check: "Keep your minor to 1 to 80 characters, without spaces at either end.",
  // P3 (US-18): mirror reportUserSchema.
  reports_note_length: "Keep the note to 500 characters or fewer.",
  reports_not_self: "You can't report yourself.",
  // R1 (US-16): one live request per student per course, so asking twice is
  // a unique violation rather than a second vote. Reached from two sides --
  // two tabs, or a direct API call -- so it needs a message either way.
  study_requests_course_id_author_id_key:
    "You've already asked for this course. Classmates can see it.",
  study_requests_note_length: "Keep your note to 200 characters or fewer.",
};

/**
 * Messages our own database functions raise by name -- `raise exception
 * 'starts_in_past'` in S1's create_session and S2's get_or_create_course.
 * Matched on the whole message, so a word inside Postgres's own text never
 * matches by accident.
 */
const RAISED_MESSAGES: Record<string, string> = {
  not_signed_in: "You've been signed out. Sign in again and try.",
  display_name_required: "Add a display name before hosting a session.",
  starts_in_past: "That start time has already passed.",
  department_required: "Choose or add a department.",
  invalid_course_number: "Enter a 4-digit course number, like 3251 or 2100W.",
  // SEC-03: the catalogue trigger (SQLSTATE PT429). It fires inside
  // get_or_create_course too, which is how it reaches the create form.
  catalogue_limit_reached:
    "You've added a lot of new courses and departments lately — the limit is " +
    `${CATALOGUE_INSERTS_PER_HOUR} of each an hour and ${CATALOGUE_INSERTS_PER_DAY} a day. ` +
    "Choose one that's already listed, or try again later.",
  // S5: join_session and leave_session.
  session_not_found: "That session doesn't exist anymore.",
  session_cancelled: "This session has been cancelled.",
  session_ended: "This session has already ended.",
  already_joined: "You're already on the roster for this session.",
  session_full: "This session is full.",
  not_joined: "You're not on the roster for this session.",
  host_cannot_leave: "As the host, you can't leave — cancel the session instead.",
  // P1 (US-11): the profile_courses_limit trigger (PROFILE_COURSES_MAX).
  profile_courses_limit: "List up to 8 current courses.",
  // P3 (US-18): the reports_limit trigger (SQLSTATE PT429, REPORTS_PER_DAY).
  report_limit_reached:
    "You've sent 5 reports in the last day, which is the limit. If you are in danger right now, call 911.",
  // S7: update_session and cancel_session (US-09).
  not_session_host: "Only the host can change or cancel this session.",
  capacity_below_roster:
    "That's fewer seats than the students already coming. Nobody is removed by an edit.",
  // SEC-05: consume_rate_limit() (*_place_lookup_rate_limit.sql, SQLSTATE
  // PT429), which createSession() calls before every place lookup.
  place_lookup_rate_limited:
    "You've tried a lot of places in the last few minutes. Wait a few minutes, then try again.",
  // S10: create_sessions_weekly (US-20).
  weeks_out_of_range: "Repeat for between 2 and 8 weeks.",
  ends_before_starts: "The session has to end after it starts.",
};

/** SQLSTATE codes with one meaning wherever they come from. */
const SQLSTATE_MESSAGES: Record<string, string> = {
  // insufficient_privilege: a grant or RLS policy refused the write.
  "42501": "You don't have permission to do that.",
};

/**
 * What the security log records for a database error (SEC-09,
 * src/lib/security-log.ts): the name databaseErrorMessage() matched it by --
 * a raised name such as `session_full`, a constraint name, or
 * `sqlstate_<code>` -- and never Postgres's text. `unmapped` is an error
 * with nothing to name it by; `none` is no error at all. Checks in the same
 * order as databaseErrorMessage(), so the two always agree (errors.test.ts).
 */
export function databaseErrorReason(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return "none";
  if (error.message && Object.hasOwn(RAISED_MESSAGES, error.message)) return error.message;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const constraint of Object.keys(CONSTRAINT_MESSAGES)) {
    if (text.includes(`"${constraint}"`)) return constraint;
  }
  // A SQLSTATE (5 characters) or PostgREST code (PGRST116) is a code, not text.
  if (error.code && /^[0-9A-Za-z]{5,8}$/.test(error.code)) {
    return `sqlstate_${error.code.toLowerCase()}`;
  }
  return "unmapped";
}

/** A message for a database error, safe to show a student. */
export function databaseErrorMessage(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;

  if (error.message && Object.hasOwn(RAISED_MESSAGES, error.message)) {
    return RAISED_MESSAGES[error.message];
  }

  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  for (const [constraint, message] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (text.includes(`"${constraint}"`)) return message;
  }

  if (error.code && error.code in SQLSTATE_MESSAGES) {
    return SQLSTATE_MESSAGES[error.code];
  }
  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Place search (M2) -- the picker's Autocomplete calls to Google, from the
// browser. Google's own error text is never shown; only the HTTP status (or
// its absence, for a network failure) picks the wording.
// ---------------------------------------------------------------------------

export const PLACE_SEARCH_FAILED_MESSAGE =
  "We couldn't search places just now. Try again in a moment.";
export const PLACE_SEARCH_BUSY_MESSAGE =
  "Place search is busy right now. Try again in a minute.";
export const PLACE_SEARCH_OFFLINE_MESSAGE =
  "We couldn't reach Google Maps. Check your connection and try again.";

/**
 * A message for a failed place search, safe to show. 429 is Google's quota
 * (per minute, or the daily cap set in M1). Any other status -- 403 for a
 * key restricted to other sites, 5xx -- is ours or Google's to fix, not the
 * student's. No status at all -- fetch's own TypeError -- means the request
 * never got an answer. Takes whatever the search threw.
 */
export function placeSearchErrorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
  if (typeof status !== "number") return PLACE_SEARCH_OFFLINE_MESSAGE;
  if (status === 429) return PLACE_SEARCH_BUSY_MESSAGE;
  return PLACE_SEARCH_FAILED_MESSAGE;
}

// ---------------------------------------------------------------------------
// Supabase Auth errors -- AuthError: a string `code` (ErrorCode in
// @supabase/auth-js), an HTTP `status`, and English `message`.
// ---------------------------------------------------------------------------

/** The fields we read from a Supabase AuthError. */
export type AuthErrorLike = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

/**
 * What the security log records for a Supabase Auth error (SEC-09): its
 * `code` -- auth-js's ErrorCode, such as `invalid_credentials` or
 * `otp_expired` -- or `http_<status>` when an older server sent none. Never
 * the message. `no_user` is Supabase answering without an error but without
 * a user either.
 */
export function authErrorReason(error: AuthErrorLike | null | undefined): string {
  if (!error) return "no_user";
  if (error.code && /^[a-z0-9_]{1,64}$/.test(error.code)) return error.code;
  if (typeof error.status === "number") return `http_${error.status}`;
  return "unmapped";
}

export const SIGN_IN_RATE_LIMITED_MESSAGE =
  "Too many sign-in emails have gone out recently. Try again in a few minutes.";

const SIGN_IN_MESSAGES: Record<string, string> = {
  // The per-address 60-second throttle and the project's hourly email cap
  // (two an hour on Supabase's built-in email service) both arrive as this.
  over_email_send_rate_limit: SIGN_IN_RATE_LIMITED_MESSAGE,
  over_request_rate_limit: SIGN_IN_RATE_LIMITED_MESSAGE,
  // Supabase's built-in email service delivers only to the project team's
  // own addresses until custom SMTP is set up (supabase/README.md, A1).
  email_address_not_authorized:
    "We can't send sign-in emails to that address yet. Ask the Study Buddy team to add it.",
  email_address_invalid: "Enter a valid Vanderbilt email address.",
  validation_failed: "Enter a valid Vanderbilt email address.",
  signup_disabled: "Sign-in is switched off right now. Try again later.",
  otp_disabled: "Sign-in is switched off right now. Try again later.",
  email_provider_disabled: "Sign-in is switched off right now. Try again later.",
};

/**
 * Supabase Auth's reply when a trigger on auth.users raised -- including A2's
 * Vanderbilt-only check. It does not say which trigger or why.
 */
const DATABASE_ERROR_SAVING_USER = "Database error saving new user";

/**
 * A message for an error from signInWithOtp(), safe to show a student.
 *
 * Never says whether the address already has an account: signInWithOtp
 * creates one if needed, so no error here depends on that.
 */
export function signInErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;

  if (error.code && error.code in SIGN_IN_MESSAGES) {
    return SIGN_IN_MESSAGES[error.code];
  }
  if (error.message?.includes(DATABASE_ERROR_SAVING_USER)) {
    // Our own form refuses other domains before calling Supabase, so this is
    // either a direct API call or a broken trigger. Either way, the domain
    // rule is the only thing worth telling a student.
    return "We couldn't create an account for that address. Use your @vanderbilt.edu email.";
  }
  if (error.status === 429) return SIGN_IN_RATE_LIMITED_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// verifyOtp() with the code from the email -- A3's verifyCode().
// ---------------------------------------------------------------------------

export const CODE_REJECTED_MESSAGE =
  "That code didn't work. Check it against the latest email — codes expire after 10 minutes — or ask for a new one.";

export const CODE_RATE_LIMITED_MESSAGE =
  "Too many tries. Wait a few minutes, then try again.";

const VERIFY_CODE_MESSAGES: Record<string, string> = {
  // Supabase Auth gives the same 403 for a wrong code and an expired one
  // ("Token has expired or is invalid"), so the message covers both.
  otp_expired: CODE_REJECTED_MESSAGE,
  validation_failed: CODE_REJECTED_MESSAGE,
  // Verifications are rate limited per IP (30 per 5 minutes by default),
  // which is also what makes guessing a code impractical.
  over_request_rate_limit: CODE_RATE_LIMITED_MESSAGE,
  otp_disabled: "Sign-in is switched off right now. Try again later.",
};

/** A message for an error from verifyOtp({ email, token }), safe to show. */
export function verifyCodeErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;
  if (error.code && error.code in VERIFY_CODE_MESSAGES) {
    return VERIFY_CODE_MESSAGES[error.code];
  }
  if (error.status === 429) return CODE_RATE_LIMITED_MESSAGE;
  // A 403 without a code we know is still a refused token.
  if (error.status === 403) return CODE_REJECTED_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// Passwords (A6): signInWithPassword() and updateUser({ password }).
// ---------------------------------------------------------------------------

export const PASSWORD_REJECTED_MESSAGE =
  "That email and password don't match. New here, or forgot it? Get a code by email instead.";

const PASSWORD_SIGN_IN_MESSAGES: Record<string, string> = {
  // Supabase gives the same answer for an unknown address and a wrong
  // password, so this never says whether the address has an account.
  invalid_credentials: PASSWORD_REJECTED_MESSAGE,
  // An account still waiting for its first code: the code is the way in.
  email_not_confirmed:
    "Finish signing up first: get a code by email, then choose a password.",
  over_request_rate_limit: CODE_RATE_LIMITED_MESSAGE,
  email_provider_disabled: "Sign-in is switched off right now. Try again later.",
};

/** A message for an error from signInWithPassword(), safe to show. */
export function passwordSignInErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;
  if (error.code && error.code in PASSWORD_SIGN_IN_MESSAGES) {
    return PASSWORD_SIGN_IN_MESSAGES[error.code];
  }
  if (error.status === 429) return CODE_RATE_LIMITED_MESSAGE;
  // Older Supabase servers answer a wrong password with a bare 400.
  if (error.status === 400) return PASSWORD_REJECTED_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

const SET_PASSWORD_MESSAGES: Record<string, string> = {
  // The hosted project's own rules (length, character mix) are stricter than
  // the form's only if someone changed them in the dashboard.
  weak_password: "Supabase wants a stronger password. Make it longer, or add numbers and symbols.",
  same_password: "That's already your password. Choose a different one, or carry on without changing it.",
  // "Secure password change" on, and the sign-in is too old to change it.
  reauthentication_needed: "For your security, sign in again with a code, then choose your password.",
  over_request_rate_limit: CODE_RATE_LIMITED_MESSAGE,
};

/** A message for an error from updateUser({ password }), safe to show. */
export function setPasswordErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;
  if (error.code && error.code in SET_PASSWORD_MESSAGES) {
    return SET_PASSWORD_MESSAGES[error.code];
  }
  if (error.status === 429) return CODE_RATE_LIMITED_MESSAGE;
  return GENERIC_ERROR_MESSAGE;
}

// ---------------------------------------------------------------------------
// The session map (M4) -- when Google Maps cannot be shown. Never Google's own
// text: its errors name the key, the referrer and the billing account, and
// none of that helps a student find a session. The list always works, so
// every message points there.
// ---------------------------------------------------------------------------

/**
 * Why the map is not showing: this deployment has no browser key (CI, Vercel
 * previews), or the Maps script failed to load or refused the key.
 */
export type MapUnavailableReason = "not_configured" | "load_failed";

/** The heading the map shows in place of itself. */
export const MAP_UNAVAILABLE_TITLE = "Map unavailable";

const MAP_UNAVAILABLE_MESSAGES: Record<MapUnavailableReason, string> = {
  not_configured: "The map isn't switched on for this version of Study Buddy. Every session is in the list.",
  load_failed: "Google Maps didn't load. Check your connection and reload, or use the list — it has every session.",
};

/** A message for a map that cannot be shown, safe to show. */
export function mapUnavailableMessage(reason: MapUnavailableReason): string {
  return MAP_UNAVAILABLE_MESSAGES[reason];
}

// ---------------------------------------------------------------------------
// Deleting an account (US-24): auth.admin.deleteUser() in deleteAccount().
// ---------------------------------------------------------------------------

export const DELETE_ACCOUNT_FAILED_MESSAGE =
  "We couldn't delete your account just now. Nothing was deleted — try again in a moment.";

/**
 * A message for an error from auth.admin.deleteUser(), safe to show.
 * `user_not_found` means the account is already gone (a second tap, say), so
 * the caller treats it as done and never shows this; anything else is ours
 * to fix, and the deletion is one statement, so nothing was half-deleted.
 */
export function deleteAccountErrorMessage(error: AuthErrorLike | null | undefined): string {
  if (error?.status === 429 || error?.code === "over_request_rate_limit") {
    return CODE_RATE_LIMITED_MESSAGE;
  }
  return DELETE_ACCOUNT_FAILED_MESSAGE;
}
