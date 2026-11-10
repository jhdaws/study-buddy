// When may a signed-in student choose a password? SEC-15 (A07), Track A.
//
// Before this, /login/password accepted ANY signed-in session: someone at a
// laptop a student left signed in could set a new password and lock the
// owner out of password sign-in (and, since Supabase signs out other
// sessions on a password change, out of everything until they get a code).
//
// The rule:
//   - No password yet: allowed. There is nothing to take over; the owner
//     still signs in with an emailed code. This is the first-time step, and
//     requireUser() sends such students here, so it must never refuse them.
//   - Already has a password: allowed only if THIS session signed in with an
//     emailed code in the last FRESH_CODE_SECONDS. That is the forgot-my-
//     password path (code -> /login/password). A session that signed in with
//     the password, or signed in by code a while ago, must get a new code.
//
// Proof of "signed in by code" is the access token's `amr` claim, which
// Supabase signs: [{ method: "otp", timestamp }, ...]. It is read with
// getClaims() (src/lib/supabase/server.ts), never from a form field.
// Pure: no I/O, so it is unit tested without Supabase.

/** How recent a code sign-in must be to change an existing password. */
export const FRESH_CODE_SECONDS = 15 * 60;

/**
 * `amr` methods that mean "proved control of the mailbox": an emailed code
 * (`otp`), the link in that email (`magiclink`), a sign-up confirmation, or
 * a recovery email.
 */
const MAILBOX_METHODS: ReadonlySet<string> = new Set(["otp", "magiclink", "email/signup", "recovery"]);

/** Clock skew tolerated for a timestamp that is slightly in the future. */
const SKEW_SECONDS = 60;

/**
 * Unix seconds of the latest mailbox sign-in recorded in `amr`, or null.
 * The bare string[] form of `amr` has no timestamps, so it never counts:
 * without a time there is no way to tell a fresh code from an old one.
 */
export function latestCodeSignIn(amr: unknown): number | null {
  if (!Array.isArray(amr)) return null;
  let latest: number | null = null;
  for (const entry of amr) {
    if (typeof entry !== "object" || entry === null) continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || !MAILBOX_METHODS.has(method)) continue;
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

/** Whether this session may choose a password now (see the rule above). */
export function mayChoosePassword({
  hasPassword,
  amr,
  nowSeconds,
}: {
  hasPassword: boolean;
  amr: unknown;
  nowSeconds: number;
}): boolean {
  if (!hasPassword) return true;
  const at = latestCodeSignIn(amr);
  if (at === null) return false;
  if (at > nowSeconds + SKEW_SECONDS) return false;
  return nowSeconds - at <= FRESH_CODE_SECONDS;
}
