// Supabase client for Server Components, Server Actions and Route Handlers,
// plus the signed-in user: getCurrentUser(), requireUser() (A4, #17) and the
// profile lookup they share.
//
// Must be created per request: it closes over that request's cookies. Never
// hoist a client into module scope, or one user's session leaks into another's
// request.

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "@/lib/env";
import {
  displayNamePath,
  loginPath,
  REQUEST_PATH_HEADER,
  safeNext,
} from "@/lib/safe-next";

/** The cookie-bound server client, typed with the generated schema. */
export type ServerClient = Awaited<ReturnType<typeof createClient>>;

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. That is safe to ignore here
          // because the proxy refreshes the session on every request; Server
          // Actions and Route Handlers, which can set cookies, do not reach
          // this branch.
        }
      },
    },
  });
}

/**
 * The signed-in user, or null.
 *
 * Uses auth.getUser(), NOT getSession(): session cookies are attacker-supplied
 * input, and getUser() revalidates the token with Supabase.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The signed-in user as the app sees them. Only what pages and actions need:
 * no email -- it stays in auth.users (ADR 0008 rule 16).
 */
export type CurrentUser = {
  /** auth.users.id, which is also profiles.id */
  id: string;
  /** profiles.display_name -- never empty here; requireUser() guarantees it */
  displayName: string;
};

/**
 * profiles.display_name for `userId`, or null if they have not chosen one
 * (or have no profile row). Read through the caller's own client, so RLS
 * applies -- A2's policy lets any signed-in user read profiles.
 *
 * Throws on a database error rather than answering null: "no name" would
 * send a student whose name exists to the name step. The message is ours,
 * not Postgres's; the page's error boundary shows a retry screen.
 */
export async function fetchDisplayName(
  supabase: ServerClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error("Could not load the signed-in student's profile.");
  }
  return data?.display_name || null;
}

/**
 * Where a student goes once they have just signed in (the emailed link, or
 * the code): the name step if they have no display name yet -- ADR 0008
 * rule 1, "required at first sign-in" -- carrying `next`; else the safe
 * `next`, or /sessions.
 *
 * Takes the client that signed them in, whose session is already set. If
 * the profile cannot be read, the student is signed in regardless and goes
 * on to `next`: requireUser() checks the name again wherever it matters, so
 * a failed read here must not turn a successful sign-in into an error page.
 */
export async function pathAfterSignIn(
  supabase: ServerClient,
  userId: string,
  next: unknown,
): Promise<string> {
  let displayName: string | null;
  try {
    displayName = await fetchDisplayName(supabase, userId);
  } catch {
    return safeNext(next);
  }
  return displayName ? safeNext(next) : displayNamePath(next);
}

// ---------------------------------------------------------------------------
// requireUser -- A4 (#17). Replaced W4's stub, which returned FIXTURE_USER.
//
//   1. getUser() -- never getSession(): the cookie is attacker-supplied, and
//      getUser() revalidates the token with Supabase.
//   2. Signed out: redirect to /login?next=<here>. The proxy redirects page
//      requests to /sessions* before they get this far; this is the
//      backstop for Server Actions (an expired session submitting a form)
//      and for any page outside /sessions that calls it. "Here" comes from
//      the REQUEST_PATH_HEADER the proxy sets on every request -- the page's
//      path, for a Server Action too -- and goes through safeNextPath().
//   3. No display name yet: redirect to the name step, carrying `next`.
//   4. Return { id, displayName }.
// redirect() throws, so callers never see a signed-out or nameless user.
//
// Wrapped in React's cache(), so several calls in one render (the page and
// a component in it) share one getUser() and one profile read. In a Server
// Action there is no render to share, and each call does the work.
//
// saveDisplayName() must NOT call this -- it would redirect the user to the
// step they are completing; it uses getCurrentUser() instead.
//
// Callers: createSession() (S3), /sessions/new. Both are dynamic already:
// this reads cookies and headers.
// ---------------------------------------------------------------------------

/** The signed-in user with their display name; redirects anyone else. */
export const requireUser = cache(async (): Promise<CurrentUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const here = (await headers()).get(REQUEST_PATH_HEADER);

  if (!user) {
    redirect(loginPath(here));
  }

  const displayName = await fetchDisplayName(supabase, user.id);
  if (!displayName) {
    redirect(displayNamePath(here));
  }

  return { id: user.id, displayName };
});
