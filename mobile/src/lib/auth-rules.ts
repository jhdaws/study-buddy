// Sign-in rules for the mobile app (US-01). Pure, so they are unit tested
// without Supabase or a device.
//
// They mirror the web app's src/lib/validation.ts and src/lib/limits.ts, and
// exist for the message only: the database's signup trigger (A2, US-01b) is
// what actually refuses other domains, and Supabase checks every code and
// password.

export const ALLOWED_EMAIL_DOMAIN = "vanderbilt.edu";

/** Same range as the web form: Supabase allows 6 to 10 digits. */
export const OTP_CODE_MIN_LENGTH = 6;
export const OTP_CODE_MAX_LENGTH = 10;

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A Vanderbilt email address, trimmed and lowercased. The domain must match
 * exactly: `@mail.vanderbilt.edu` is refused, as on the web.
 */
export function checkEmail(input: string): Checked<string> {
  const email = input.trim().toLowerCase();
  if (!email) return { ok: false, message: "Enter your Vanderbilt email address." };
  if (!EMAIL_SHAPE.test(email)) return { ok: false, message: "Enter a valid email address." };
  if (email.slice(email.lastIndexOf("@") + 1) !== ALLOWED_EMAIL_DOMAIN) {
    return { ok: false, message: `Use your @${ALLOWED_EMAIL_DOMAIN} email address.` };
  }
  return { ok: true, value: email };
}

/** The emailed code. Spaces and hyphens are dropped, so a pasted `123 456` works. */
export function checkCode(input: string): Checked<string> {
  const code = input.replace(/[\s-]/g, "");
  const tooShortOrLong = code.length < OTP_CODE_MIN_LENGTH || code.length > OTP_CODE_MAX_LENGTH;
  if (!/^\d+$/.test(code) || tooShortOrLong) {
    return { ok: false, message: "Enter the code from the email, digits only." };
  }
  return { ok: true, value: code };
}

/** What a Supabase Auth error looks like, as far as these messages need. */
export type AuthErrorLike = { code?: string; status?: number } | null | undefined;

export const GENERIC_ERROR = "Something went wrong. Check your connection and try again.";

/**
 * A password sign-in failure. Supabase answers an unknown address and a wrong
 * password the same way, and so does this: it never says whether an account
 * exists.
 */
export function passwordErrorMessage(error: AuthErrorLike): string {
  if (error?.status === 429) return "Too many tries. Wait a minute and try again.";
  if (error?.code === "invalid_credentials" || error?.status === 400) {
    return "That email and password don't match. Try again, or sign in with a code.";
  }
  return GENERIC_ERROR;
}

/**
 * Asking for a code. The app does not create accounts (shouldCreateUser is
 * false: the web app's name and password steps would be skipped), so an
 * unknown address is told to sign up on the website.
 */
export function sendCodeErrorMessage(error: AuthErrorLike): string {
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit") {
    return "Too many codes requested. Wait a minute, then try again.";
  }
  if (error?.code === "otp_disabled" || error?.code === "signup_disabled" || error?.status === 422) {
    return "New to Study Buddy? Sign up on the website first, then sign in here.";
  }
  return GENERIC_ERROR;
}

/** Checking the code. */
export function verifyCodeErrorMessage(error: AuthErrorLike): string {
  if (error?.status === 429) return "Too many tries. Wait a minute and try again.";
  if (error?.code === "otp_expired" || error?.status === 403 || error?.status === 401) {
    return "That code is wrong or has expired. Ask for a new one.";
  }
  return GENERIC_ERROR;
}
