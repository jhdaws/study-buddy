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

import { redirect } from "next/navigation";

import {
  displayNameSchema,
  invalidFormState,
  signInSchema,
  type DisplayNameField,
  type FormState,
  type SignInField,
} from "@/lib/validation";

/**
 * What signIn() hands back to `useActionState`. Start from `{}`.
 * `sentTo` is set once a link has gone out: show "check your inbox" for that
 * address instead of the form.
 */
export type SignInState = FormState<SignInField> & {
  sentTo?: string;
};

/** What saveDisplayName() hands back when it does not redirect. Start from `{}`. */
export type DisplayNameState = FormState<DisplayNameField>;

// ===========================================================================
// STUB (W4, #11) -- replaced by A3 (#16). Keep the signature.
//
// Validates for real, then pretends the link was sent. NO EMAIL IS SENT.
//
// The real body must:
//   1. signInSchema.safeParse(Object.fromEntries(formData)); on failure
//      return invalidFormState(...).
//   2. supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
//      through the server client, with emailRedirectTo pointing at
//      /auth/confirm on THIS deployment's origin, carrying ?next= if the form
//      sent one. A1 (#14) sets the matching redirect URLs in Supabase.
//   3. On error -- rate limits, and A2's trigger refusing the domain -- set
//      `formError` through src/lib/errors.ts. Never raw auth or Postgres text.
//   4. Return { sentTo: email }. Say the same thing whether or not the
//      address already has an account.
// ===========================================================================

/** Send a magic sign-in link to a Vanderbilt address (US-01). */
export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }
  return { sentTo: parsed.data.email };
}

// ===========================================================================
// STUB (W4, #11) -- replaced by A4 (#17). Keep the signature.
//
// Validates for real, then redirects to /sessions. NOTHING IS SAVED.
//
// The real body must:
//   1. getCurrentUser() -- NOT requireUser(), which would bounce a user
//      without a name back to this very step. Signed out: redirect to /login.
//   2. displayNameSchema.safeParse(Object.fromEntries(formData)); on failure
//      return invalidFormState(...).
//   3. Update the caller's own profiles.display_name (A2's RLS policy allows
//      only their own row). Errors through src/lib/errors.ts.
//   4. redirect() to the form's hidden `next` field if it is a same-origin
//      path (starts with "/" but not "//"), else to /sessions. Outside any
//      try/catch.
// ===========================================================================

/** Save the display name at first sign-in (US-01, ADR 0008 rule 1). */
export async function saveDisplayName(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  const parsed = displayNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }
  redirect("/sessions");
}

// ===========================================================================
// STUB (W4, #11) -- replaced by A3 (#16). Keep the signature.
//
// Redirects to / without signing anyone out -- nobody is signed in yet.
//
// The real body must call supabase.auth.signOut() through the server client
// (which clears the session cookies), then redirect("/").
// ===========================================================================

/** Sign out (US-21). Use as `<form action={signOut}>`. */
export async function signOut(): Promise<void> {
  redirect("/");
}
