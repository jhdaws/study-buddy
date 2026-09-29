// Supabase client for Server Components, Server Actions and Route Handlers.
//
// Must be created per request: it closes over that request's cookies. Never
// hoist a client into module scope, or one user's session leaks into another's
// request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnv } from "@/lib/env";

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
