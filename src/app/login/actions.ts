"use server";

// Server actions for sign-in, the display-name step, and sign-out (US-01,
// US-21). Owner: Track A.
//
// A "use server" file may export only async functions (and types, which are
// erased). Every action is a public POST endpoint: validate inside it.
//
// The email-domain rule in signInSchema is for the error message only. The
// authoritative check is A2's (#15) signup trigger in the database, so that
// calling the Supabase auth API directly cannot bypass it (US-01b).

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  databaseErrorMessage,
  signInErrorMessage,
  verifyCodeErrorMessage,
} from "@/lib/errors";
import { requestOrigin } from "@/lib/request-origin";
import { DEFAULT_NEXT_PATH, loginPath, safeNext, safeNextPath } from "@/lib/safe-next";
import { createClient, getCurrentUser, pathAfterSignIn } from "@/lib/supabase/server";
import {
  displayNameSchema,
  formValues,
  invalidFormState,
  signInSchema,
  verifyCodeSchema,
  type DisplayNameField,
  type FormState,
  type SignInField,
  type VerifyCodeField,
} from "@/lib/validation";

/**
 * What signIn() hands back to `useActionState`. Start from `{}`.
 * `sentTo` is set once a link has gone out: show "check your inbox" for that
 * address instead of the form.
 */
export type SignInState = FormState<SignInField> & {
  sentTo?: string;
};

/**
 * What verifyCode() hands back when it does not redirect (it redirects on
 * success). Start from `{}`.
 */
export type VerifyCodeState = FormState<VerifyCodeField>;

/** What saveDisplayName() hands back when it does not redirect. Start from `{}`. */
export type DisplayNameState = FormState<DisplayNameField>;

// ---------------------------------------------------------------------------
// signIn -- A3 (#16).
//
// Form fields: `email`, and an optional hidden `next` (where to go after
// signing in; dropped unless safeNextPath() accepts it).
//
// The link Supabase emails is built by the template in
// supabase/templates/magic_link.html (A1) from `emailRedirectTo`:
//   <emailRedirectTo>&token_hash=...&type=email
// so emailRedirectTo is ALWAYS /auth/confirm?next=... on this deployment's
// origin -- it must carry a query string for the template's "&" to append to.
// Supabase uses it only if it matches the redirect allow list (A1, and
// config.toml locally); otherwise the template falls back to the Site URL.
//
// Same reply whether or not the address already has an account:
// signInWithOtp() signs up a new address and signs in a known one, and both
// end in { sentTo }.
// ---------------------------------------------------------------------------

/** Send a magic sign-in link to a Vanderbilt address (US-01). */
export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }
  const { email } = parsed.data;

  const origin = requestOrigin(await headers());
  if (!origin) {
    // Every browser request has a Host header; this is not a student's
    // mistake, so do not pretend a link went out.
    return { formError: signInErrorMessage(null), values: formValues(formData) };
  }
  const confirm = new URL("/auth/confirm", origin);
  confirm.searchParams.set("next", safeNextPath(formData.get("next")) ?? DEFAULT_NEXT_PATH);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: confirm.toString(), shouldCreateUser: true },
  });
  if (error) {
    return { formError: signInErrorMessage(error), values: formValues(formData) };
  }
  return { sentTo: email };
}

// ---------------------------------------------------------------------------
// verifyCode -- A3 (#16), added at the user's request alongside the link.
//
// The sign-in email carries a one-time code as well as the link (A1's
// template), at the user's request: Vanderbilt mail goes through Microsoft
// Outlook, whose Safe Links scanning can open links before the student does,
// and a code typed on a phone works even when the email was opened on a
// laptop. CAVEAT: link and code are the same token -- whichever is used
// first works and the other then fails -- so a scanner that opens the link
// spends the code too. Whether Vanderbilt's scanning does that is untested;
// supabase/README.md ("Hosted auth settings") has the fix if it does.
//
// Form fields: `email` and `next` (hidden, carried over from the sign-in
// step) and `code`. The email is re-validated -- the hidden field is as
// forgeable as any other -- and Supabase checks that the code belongs to it.
// ---------------------------------------------------------------------------

/** Sign in with the one-time code from the email (US-01). */
export async function verifyCode(
  _prev: VerifyCodeState,
  formData: FormData,
): Promise<VerifyCodeState> {
  const parsed = verifyCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }
  const { email, code } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    return { formError: verifyCodeErrorMessage(error), values: formValues(formData) };
  }

  // First sign-in without a display name: the name step first (A4).
  const destination = await pathAfterSignIn(supabase, data.user.id, formData.get("next"));
  // Outside any try/catch: redirect() works by throwing.
  redirect(destination);
}

// ---------------------------------------------------------------------------
// saveDisplayName -- A4 (#17). Replaced W4's stub, which saved nothing.
//
// The name step at /login/name (ADR 0008 rule 1: required at first sign-in).
// Form fields: `displayName`, and an optional hidden `next`.
//
//   1. getCurrentUser() -- NOT requireUser(), which would bounce a user
//      without a name back to this very step. Signed out: to /login.
//   2. displayNameSchema; on failure, field errors.
//   3. Update the caller's own profiles row, through their own client: A2's
//      RLS policy and column grant allow exactly that, and nothing else.
//      A2's CHECK repeats the schema's rule; its error is mapped by
//      databaseErrorMessage(). No row updated (no profile, or A2's policy
//      missing) is an error too, not a silent success.
//   4. redirect() to the safe `next`, else /sessions -- outside any try.
// ---------------------------------------------------------------------------

/** Shown when the update matched no row: there is no profile to name. */
const NO_PROFILE_MESSAGE =
  "We couldn't find your profile to save that name. Sign out, sign in again, and retry.";

/** Save the display name at first sign-in (US-01, ADR 0008 rule 1). */
export async function saveDisplayName(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(formData.get("next")));
  }

  const parsed = displayNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id)
    .select("id");
  if (error) {
    return { formError: databaseErrorMessage(error), values: formValues(formData) };
  }
  if (!data || data.length === 0) {
    return { formError: NO_PROFILE_MESSAGE, values: formValues(formData) };
  }

  redirect(safeNext(formData.get("next")));
}

// ---------------------------------------------------------------------------
// signOut -- A3 (#16), US-21.
//
// Through the server client, which ends this session at Supabase (its
// refresh token is revoked) and clears the session cookies on this response.
// Changing cookies in a Server Action makes Next re-render the layout, so the
// header flips to "Sign in".
//
// scope "local": this device only. US-21 is about leaving a shared or
// borrowed device; auth-js's default, "global", would also sign the student
// out on their own phone. A "sign out everywhere" button (ADR 0003's
// follow-up) would pass "global". The cookies are cleared even if Supabase
// cannot be reached, so the error is not shown -- there is nothing the
// student could do about it.
// ---------------------------------------------------------------------------

/** Sign out (US-21). Use as `<form action={signOut}>`. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}
