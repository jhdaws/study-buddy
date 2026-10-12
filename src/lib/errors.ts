// Maps database and auth error codes onto messages a student should actually
// see.
//
// TODO -- S3 (#20) adds the mapping for create_session's errors (S1, #18),
// and later the join routine's (session full, cancelled, ended), in a later
// sprint. The auth half below is A3's (#16).
//
// Keep every function here pure: it makes the failure paths that are awkward
// to reproduce against a live database cheap to unit test. Never surface raw
// Postgres or GoTrue text to a user -- it leaks schema and trigger names, and
// it is written for whoever wrote the trigger, not for a student.

import { ALLOWED_EMAIL_DOMAIN } from "@/lib/env";

/**
 * The parts of a Supabase `AuthError` this module reads.
 *
 * Declared rather than imported so the mapping stays a pure function of plain
 * data and the tests need no Supabase client. A real `AuthError` structurally
 * satisfies it.
 */
export type AuthFailure = {
  code?: string | null;
  status?: number | null;
  message?: string | null;
};

const GENERIC_SIGN_IN_ERROR =
  "Something went wrong sending your sign-in link. Try again in a moment.";

/**
 * What to show when `signInWithOtp` fails.
 *
 * Note what is NOT here: anything about whether the address already has an
 * account. ADR 0003 makes possession of a `vanderbilt.edu` inbox the whole
 * verification, and signIn() says the same thing either way, so this must not
 * give the distinction away.
 */
export function signInErrorMessage(error: AuthFailure): string {
  const code = error.code ?? "";
  const message = error.message ?? "";

  // Supabase's free plan rate-limits outbound auth email (ADR 0003,
  // "Consequences"). Four testers will not hit it; a demo might.
  if (
    error.status === 429 ||
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit"
  ) {
    return "Too many sign-in emails have been sent. Wait a few minutes, then try again.";
  }

  if (code === "email_address_invalid") {
    return "That email address isn't valid.";
  }

  // A2's signup trigger refusing the domain surfaces here. GoTrue reports a
  // trigger that raised as a generic "Database error saving new user" and
  // does not pass our message through, so match both spellings.
  //
  // Through our own form this is close to unreachable: signInSchema and
  // signIn() both check the domain first. It is reachable by anyone posting
  // straight to the action, which is exactly who the trigger is there for.
  if (
    message.includes(ALLOWED_EMAIL_DOMAIN) ||
    message.includes("Database error saving new user")
  ) {
    return `Sign-in is only open to @${ALLOWED_EMAIL_DOMAIN} email addresses.`;
  }

  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return "Sign-in is temporarily unavailable. Try again later.";
  }

  return GENERIC_SIGN_IN_ERROR;
}

/**
 * What to show when a magic link does not check out at /auth/confirm.
 *
 * One message for every cause -- expired, already used, tampered with, or
 * simply absent. The student's next step is the same in each case, and
 * distinguishing them would tell someone holding a stolen link which part of
 * it to change.
 */
export function confirmLinkErrorMessage(): string {
  return "That sign-in link has expired or has already been used. Enter your email to get a new one.";
}

/** What to show when saving a display name fails (A4). */
export function saveDisplayNameErrorMessage(): string {
  return "We couldn't save your name. Try again.";
}
