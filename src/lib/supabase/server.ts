// Supabase client for Server Components, Server Actions and Route Handlers,
// plus requireUser() -- a W4 stub until A4 (#17), see the bottom of the file.
//
// Must be created per request: it closes over that request's cookies. Never
// hoist a client into module scope, or one user's session leaks into another's
// request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "@/lib/env";
import { FIXTURE_USER } from "@/lib/fixtures";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient(url, anonKey, {
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

// ===========================================================================
// STUB (W4, #11) -- replaced by A4 (#17). Keep the signature.
//
// Until sign-in exists, everyone is FIXTURE_USER, so the app clicks through
// end to end. Nothing is checked. That is the only reason this is safe to
// ship: no real data exists yet either.
//
// The real body must:
//   1. getCurrentUser() -- getUser(), never getSession().
//   2. Signed out: redirect to /login. Keep where they were going as ?next=
//      when you know it (the proxy handles page requests; this is the
//      backstop for Server Actions and direct POSTs). If you need the current
//      path here, have the proxy forward it as a request header rather than
//      changing this signature.
//   3. Read profiles.display_name for that id. None yet: redirect to the name
//      step (A4 picks the route, e.g. /login/name, carrying ?next=).
//   4. Return { id, displayName }.
// redirect() throws, so callers never see a signed-out or nameless user.
// Worth wrapping in React's cache() so several calls in one render share a
// lookup. saveDisplayName() must NOT call this -- it would redirect the user
// to the step they are completing; it uses getCurrentUser() instead.
//
// Callers: createSession() (S3), and any page that needs the user
// (sessions/new, W5).
// ===========================================================================

/** The signed-in user with their display name; redirects anyone else. */
export async function requireUser(): Promise<CurrentUser> {
  return FIXTURE_USER;
}
