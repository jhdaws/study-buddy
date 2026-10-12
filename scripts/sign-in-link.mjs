// A one-time sign-in link for a Vanderbilt address, made WITHOUT sending an
// email. A demo stopgap for W6 (#13) until A5 (#35) sets up an email sender:
// the hosted project's built-in sender allows 2 emails an hour and its
// templates cannot be edited without custom SMTP, so emailed sign-in does not
// work there yet.
//
//   node --env-file=.env.hosted scripts/sign-in-link.mjs name@vanderbilt.edu
//
// .env.hosted (gitignored by `.env*`) holds the HOSTED project's
// NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY -- the secret key, from
// Project Settings -> API Keys. Never commit it; never paste it into chat.
// Prints a link to /auth/confirm on the live site. Send it to that person; it
// signs them in on any device, once, until the OTP expiry (an hour by
// default). A first-time address gets an account, and the name step.
//
// What it skips: proving the person owns the inbox. Only someone holding the
// secret key can run it, which is why it is a stopgap and not a feature.
// What it keeps: the Vanderbilt-only rule. The signup trigger (A2) refuses
// any other domain, and this script refuses first so the message is clear.
//
// Plain Node plus @supabase/supabase-js, already a dependency.

import { createClient } from "@supabase/supabase-js";

/** Where the link points. Override with SIGN_IN_SITE_URL, e.g. for localhost. */
const SITE_URL = process.env.SIGN_IN_SITE_URL ?? "https://study-buddy-jdaws.vercel.app";

/** Where to land after signing in (the name step comes first if needed). */
const NEXT_PATH = "/sessions";

/** The same rule as signInSchema and the A2 trigger: exactly @vanderbilt.edu. */
const VANDERBILT_EMAIL = /^[^@\s]+@vanderbilt\.edu$/;

/** Token types /auth/confirm accepts (ACCEPTED_TYPES in its route.ts). */
const CONFIRM_TYPES = new Set(["email", "magiclink", "signup"]);

function fail(message) {
  console.error(`sign-in-link: ${message}`);
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  fail("usage: node --env-file=.env.hosted scripts/sign-in-link.mjs name@vanderbilt.edu");
}
if (!VANDERBILT_EMAIL.test(email)) {
  fail(`${email} is not an @vanderbilt.edu address. Only those can sign in.`);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  fail("set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (see the top of this file).");
}
if (secretKey.startsWith("sb_publishable_")) {
  fail("SUPABASE_SECRET_KEY is the publishable key. Use the secret key.");
}

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// generateLink creates the token -- and the user, for a first-time address --
// but sends nothing. Its properties carry the token hash /auth/confirm takes.
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error) {
  fail(`Supabase refused: ${error.message}`);
}

const { hashed_token: tokenHash, verification_type: type } = data.properties;
if (!tokenHash || !CONFIRM_TYPES.has(type)) {
  fail(`unexpected reply from Supabase (verification_type ${JSON.stringify(type)}).`);
}

const link = new URL("/auth/confirm", SITE_URL);
link.searchParams.set("token_hash", tokenHash);
link.searchParams.set("type", type);
link.searchParams.set("next", NEXT_PATH);

console.log(`One-time sign-in link for ${email} (works once, expires within the hour):\n`);
console.log(link.toString());
