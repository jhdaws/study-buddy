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
// On only when BOTH hold:
//   - TEST_LOGIN_EMAIL is set (server-only; .env.local, Vercel "Preview");
//   - the deployment is not Vercel production (VERCEL_ENV !== "production"),
//     so setting the variable on production by mistake does nothing.

/** The test address, lower-cased, or null when the test login is off. */
export function testLoginEmail(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.VERCEL_ENV === "production") return null;
  const email = env.TEST_LOGIN_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

/** True when the test login is on and `email` is its address. */
export function isTestLoginEmail(email: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const testEmail = testLoginEmail(env);
  return testEmail !== null && email.trim().toLowerCase() === testEmail;
}
