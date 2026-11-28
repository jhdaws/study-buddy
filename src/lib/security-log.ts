import "server-only";

// The security log (SEC-09, threat model T12): one line per failed sign-in
// or refused action, so that a burst of them -- password guessing, code
// guessing, someone hammering a full session -- shows up in the server logs
// (Vercel's function logs, `npm run start`'s output) instead of nowhere.
//
// Each event is ONE console.warn call with ONE argument: a JSON object on a
// single line, so it can be searched for (`"log":"security"`) and parsed.
// Since V6 (#152) it is written by src/lib/log.ts's formatLogLine(), so it
// also carries the level and the request ID every other server line has --
// search the requestId to see what else that request did.
//
//   {"level":"warn","event":"sign_in_password_failed","message":"security: sign_in_password_failed",
//    "requestId":"6f1c...","at":"2026-11-09T20:00:00.000Z","log":"security",
//    "reason":"invalid_credentials","emailHash":"5d41..."}
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

import { currentRequestId, formatLogLine, writeLogLine } from "@/lib/log";

/** Everything the security log records. Add an event here before logging it. */
export type SecurityEventName =
  // signInWithPassword(): Supabase refused the email and password.
  | "sign_in_password_failed"
  // verifyCode(): Supabase refused the emailed one-time code.
  | "sign_in_code_failed"
  // confirmSignIn(): Supabase refused the emailed link's token (#94).
  | "sign_in_link_failed"
  // joinSession(): join_session refused (session_full, already_joined, ...).
  | "session_join_refused"
  // createSession(): the place, get_or_create_course or create_session refused.
  | "session_create_refused"
  // editSession() / cancelSession() (US-09): refused -- not_session_host is
  // someone trying to change a session that is not theirs.
  | "session_edit_refused"
  | "session_cancel_refused"
  // sendMessage() (US-05): the insert was refused -- sqlstate_42501 is a post
  // from someone not on the roster, or to a chat that has closed.
  | "chat_post_refused";

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

/**
 * Write one security event to the server log. Await it (it reads the
 * request ID first); it never throws.
 */
export async function logSecurityEvent({ event, reason, userId, email, sessionId }: SecurityEvent): Promise<void> {
  try {
    const fields: Record<string, string> = {
      log: "security",
      reason: REASON_CODE.test(reason) ? reason : "invalid_reason",
    };
    // From Supabase (getUser()), never from the request.
    if (userId !== undefined) fields.userId = userId;
    if (email !== undefined) fields.emailHash = hashEmail(email);
    if (sessionId !== undefined) fields.sessionId = UUID.test(sessionId) ? sessionId : "invalid_id";
    const requestId = await currentRequestId();
    writeLogLine("warn", formatLogLine("warn", event, `security: ${event}`, fields, { requestId }));
  } catch {
    // Like every log call: never break the request it describes.
  }
}
