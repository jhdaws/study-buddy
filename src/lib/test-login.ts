// The test login: one address that signs in without an email, so the team
// can build and test without Supabase's email limits (2 an hour, team
// members only). Local development and Vercel previews only.
//
// How it works (src/app/login/actions.ts):
//   signIn()     -- for the test address, skips signInWithOtp() and goes
//                   straight to the code step. No email is sent.
//   verifyCode() -- for the test address, calls signInWithPassword() with the
//                   typed code as the password. Supabase checks it.
//
// The code is the test user's PASSWORD in Supabase Auth and is never in this
// repository (it is public). Setup, and why it must stay private:
// supabase/README.md, "Test login".
//
// Where it is on:
//   - Vercel production (VERCEL_ENV=production): NEVER, whatever is set.
//   - Vercel previews: on for DEFAULT_PREVIEW_TEST_EMAIL, or for
//     TEST_LOGIN_EMAIL if that is set. The default exists because only the
//     project owner can set Vercel variables; the address is not a secret
//     (the code, a Supabase password, is).
//   - Anywhere else (local): only if TEST_LOGIN_EMAIL is set in .env.local.

/** The team's shared test address, used on previews unless overridden. */
export const DEFAULT_PREVIEW_TEST_EMAIL = "group4@vanderbilt.edu";

/** The test address, lower-cased, or null when the test login is off. */
export function testLoginEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL_ENV === "production") return null;
  const email = env.TEST_LOGIN_EMAIL?.trim().toLowerCase();
  if (email) return email;
  return env.VERCEL_ENV === "preview" ? DEFAULT_PREVIEW_TEST_EMAIL : null;
}

/** True when the test login is on and `email` is its address. */
export function isTestLoginEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const testEmail = testLoginEmail(env);
  return testEmail !== null && email.trim().toLowerCase() === testEmail;
}
