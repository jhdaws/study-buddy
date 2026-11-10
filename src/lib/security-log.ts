import "server-only";

// The security log (SEC-09, threat model T12): one line per failed sign-in
// or refused action, so that a burst of them -- password guessing, code
// guessing, someone hammering a full session -- shows up in the server logs
// (Vercel's function logs, `npm run start`'s output) instead of nowhere.
//
// Each event is ONE console.warn call with ONE argument: a JSON object on a
// single line, so it can be searched for (`"log":"security"`) and parsed.
//
//   {"log":"security","event":"sign_in_password_failed","reason":"invalid_credentials",
//    "at":"2026-11-09T20:00:00.000Z","emailHash":"5d41..."}
//
// WHAT NEVER GOES IN: a password, a sign-in code, a token, a raw email
// address, or Supabase's / Postgres's own error text. Callers pass a reason
// CODE (authErrorReason(), databaseErrorReason() in src/lib/errors.ts, or a
// PlaceError's reason); anything that does not look like one is logged as
// "invalid_reason" instead, so a mistaken `error.message` cannot leak. Ids
// that came from the browser (a session id) are logged only if they are
// well-formed UUIDs: JSON escaping already stops a forged newline, and this
// stops forged content.
//
// WHO: the signed-in user's id when there is one; otherwise, for a failed
// sign-in, a SHA-256 of the lower-cased email. That lets repeated failures
// against one account be counted without the log holding the address.
// It is pseudonymous, not anonymous: anyone who guesses an address can hash
// it and find its lines. A keyed hash (HMAC with a server-only secret) would
// stop that, at the cost of one more secret to manage -- worth doing if
// these logs are ever sent anywhere wider than Vercel's own.

import { createHash } from "node:crypto";

/** Everything the security log records. Add an event here before logging it. */
export type SecurityEventName =
  // signInWithPassword(): Supabase refused the email and password.
  | "sign_in_password_failed"
  // verifyCode(): Supabase refused the emailed one-time code.
  | "sign_in_code_failed"
  // joinSession(): join_session refused (session_full, already_joined, ...).
  | "session_join_refused"
  // createSession(): the place, get_or_create_course or create_session refused.
  | "session_create_refused";

export type SecurityEvent = {
  event: SecurityEventName;
  /** A machine-readable code, never a message: see the comment at the top. */
  reason: string;
  /** The signed-in user, when there is one. */
  userId?: string;
  /** For a failed sign-in, where there is no user yet. Logged only as a hash. */
  email?: string;
  /** The session the action was about, if any. Comes from the browser. */
  sessionId?: string;
};

/** Shape of a reason code: lower-case words joined by underscores. */
const REASON_CODE = /^[a-z0-9_]{1,64}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SHA-256, hex, of the trimmed, lower-cased email. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** Write one security event to the server log. Never throws. */
export function logSecurityEvent({ event, reason, userId, email, sessionId }: SecurityEvent): void {
  const line: Record<string, string> = {
    log: "security",
    event,
    reason: REASON_CODE.test(reason) ? reason : "invalid_reason",
    at: new Date().toISOString(),
  };
  // From Supabase (getUser()), never from the request.
  if (userId !== undefined) line.userId = userId;
  if (email !== undefined) line.emailHash = hashEmail(email);
  if (sessionId !== undefined) line.sessionId = UUID.test(sessionId) ? sessionId : "invalid_id";
  console.warn(JSON.stringify(line));
}
