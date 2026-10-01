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
// Still to come:
//   - S3 (#20): create_session's errors (S1, #18). Add its constraint names
//     to CONSTRAINT_MESSAGES and any custom SQLSTATEs to SQLSTATE_MESSAGES.
//   - Later: the join routine's (session full, cancelled, ended, not signed in).

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
};

/** SQLSTATE codes with one meaning wherever they come from. */
const SQLSTATE_MESSAGES: Record<string, string> = {
  // insufficient_privilege: a grant or RLS policy refused the write.
  "42501": "You don't have permission to do that.",
};

/** A message for a database error, safe to show a student. */
export function databaseErrorMessage(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return GENERIC_ERROR_MESSAGE;

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
// Supabase Auth errors -- AuthError: a string `code` (ErrorCode in
// @supabase/auth-js), an HTTP `status`, and English `message`.
// ---------------------------------------------------------------------------

/** The fields we read from a Supabase AuthError. */
export type AuthErrorLike = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

export const SIGN_IN_RATE_LIMITED_MESSAGE =
  "Too many sign-in emails have gone out recently. Wait a minute, then try again.";

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
  "That code didn't work. Check it against the latest email — codes expire after an hour — or ask for a new one.";

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
