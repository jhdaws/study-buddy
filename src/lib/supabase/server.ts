// Supabase client for Server Components, Server Actions and Route Handlers,
// plus requireUser(), which A4 (#17) implemented at the bottom of the file.
//
// Must be created per request: it closes over that request's cookies. Never
// hoist a client into module scope, or one user's session leaks into another's
// request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { supabaseEnv } from "@/lib/env";
import { LOGIN_PATH, NAME_STEP_PATH } from "@/lib/redirects";

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

/**
 * The signed-in user with their display name; redirects anyone else.
 *
 * redirect() throws, so a caller never sees a signed-out or nameless user --
 * which is what lets pages and actions treat the return value as a given.
 *
 * Wrapped in React's cache() so that a page and the action behind it, or two
 * components in one render, share a single lookup rather than repeating the
 * getUser() round trip. The cache lasts one request, which is also the
 * lifetime of the cookies it is derived from.
 *
 * No `?next=` on the sign-in redirect. This function cannot see the path the
 * user asked for -- a Server Function runs at its own route -- and the stub's
 * note offered forwarding it through a request header. It is not worth the
 * machinery: every PAGE request to a private route goes through the proxy
 * (./proxy.ts) first, and that does attach `?next=`. What reaches here signed
 * out is a Server Function or a direct POST, where the path the browser
 * happens to be on is not where you would want to send anyone anyway.
 *
 * saveDisplayName() must NOT call this: it would redirect the user to the
 * very step they are completing. It uses getCurrentUser() instead.
 *
 * Callers: createSession() (S3), and any page that needs the user
 * (sessions/new, W5).
 */
export const requireUser = cache(async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(LOGIN_PATH);
  }

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // A failed read is not the same as "no name": sending them to the name step
  // would have them fill in a name we then could not save. Let it surface.
  if (error) {
    throw new Error(`Could not read the signed-in user's profile: ${error.message}`);
  }

  const displayName = profile?.display_name?.trim();
  if (!displayName) {
    // ADR 0008 rule 1: the row exists from signup with display_name null.
    redirect(NAME_STEP_PATH);
  }

  return { id: user.id, displayName };
});
