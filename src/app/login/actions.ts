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

import { saveDisplayNameErrorMessage, signInErrorMessage } from "@/lib/errors";
import { LOGIN_PATH, safeNextPath } from "@/lib/redirects";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import {
  displayNameSchema,
  formValues,
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

/**
 * Where the magic link should land: /auth/confirm on this deployment, with
 * the onward path attached so a link from a protected page returns there.
 *
 * `next` is ALWAYS set, even when it is just the default. The email templates
 * (supabase/templates/*.html) append `&token_hash=…` to this URL, which is
 * only well-formed if a `?` is already present. Making `next` conditional
 * here produces a broken link, so don't.
 *
 * The origin is read from the request headers, which a client controls. That
 * is safe here only because Supabase refuses any `emailRedirectTo` outside
 * the redirect-URL allow-list configured for the project (A1, #14): a forged
 * Host cannot point a real magic link somewhere else, it can only get the
 * send rejected. Nothing downstream trusts this value.
 */
async function confirmUrl(next: string): Promise<string> {
  const headerList = await headers();
  // A Server Function is a same-origin POST, so `origin` is normally set.
  const origin =
    headerList.get("origin") ??
    (() => {
      const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
      const proto =
        headerList.get("x-forwarded-proto") ??
        (host?.startsWith("localhost") || host?.startsWith("127.0.0.1")
          ? "http"
          : "https");
      return `${proto}://${host}`;
    })();

  const url = new URL("/auth/confirm", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

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
  // The form carries where the user was headed; refuse anything off-site
  // before it reaches the email (src/lib/redirects.ts).
  const next = safeNextPath(formData.get("next"));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: await confirmUrl(next) },
  });

  if (error) {
    return {
      formError: signInErrorMessage(error),
      values: formValues<SignInField>(formData),
    };
  }

  // Deliberately the same reply whether or not that address has an account
  // (ADR 0003): the inbox is the verification, so telling them which it was
  // would turn this form into an account-existence oracle.
  return { sentTo: email };
}

/** Save the display name at first sign-in (US-01, ADR 0008 rule 1). */
export async function saveDisplayName(
  _prev: DisplayNameState,
  formData: FormData,
): Promise<DisplayNameState> {
  // getCurrentUser(), NOT requireUser(): requireUser() sends a user with no
  // display name to the name step, which is the form that just submitted
  // this. It would loop.
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const parsed = displayNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return invalidFormState(parsed.error, formData);
  }

  const supabase = await createClient();
  // A2's RLS policy restricts this to the caller's own row, so the `eq` is
  // belt and braces -- but without it the statement reads as though it might
  // update everyone's, and the next person to touch it deserves better.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", user.id);

  if (error) {
    return {
      formError: saveDisplayNameErrorMessage(),
      values: formValues<DisplayNameField>(formData),
    };
  }

  // Outside any try/catch: redirect() works by throwing. safeNextPath()
  // refuses anything that is not a path on this origin -- the value arrives
  // in a hidden form field, so it is the user's to set.
  redirect(safeNextPath(formData.get("next")));
}

/** Sign out (US-21). Use as `<form action={signOut}>`. */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  // Clears this browser's session cookies. A failure here is not worth
  // showing anyone: the redirect below leaves them on a signed-out page
  // either way, and the cookies are cleared before it resolves.
  await supabase.auth.signOut();

  // Outside any try/catch: redirect() works by throwing.
  redirect("/");
}
