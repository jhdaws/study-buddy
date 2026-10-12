// The demo account: one fixed Vanderbilt address that signs in with a fixed
// code and never gets an email, so graders and classmates can try the app
// without a Vanderbilt inbox (and without spending Supabase's hourly email
// allowance).
//
// How it works (src/app/login/actions.ts):
//   signIn()     -- for this address, skips signInWithOtp() and goes straight
//                   to the code step. No email is sent.
//   verifyCode() -- for this address, calls signInWithPassword() with the
//                   typed code as the password.
//
// So the code is not in this file: it is the demo user's PASSWORD in
// Supabase Auth. The account exists only where someone created it
// (supabase/README.md, "Demo account"); where it does not, the demo address
// simply gets "That code didn't work". The address and code are public on
// purpose -- never give this account anything worth protecting.

export const DEMO_EMAIL = "njpm@vanderbilt.edu";

/** True for the demo address, ignoring case and surrounding spaces. */
export function isDemoEmail(email: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL;
}
