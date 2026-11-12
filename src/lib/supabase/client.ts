// Supabase client for Client Components and realtime subscriptions.
//
// Client Components import this; it must never be used on the server, where
// each request needs its own cookie-bound client (see server.ts).

import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "@/lib/env";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/limits";

export function createClient() {
  const { url, anonKey } = supabaseEnv();
  // createBrowserClient reuses one instance per page, so calling this from
  // several components does not open several realtime connections.
  // The same cookie lifetime as the server clients (SEC-16).
  return createBrowserClient(url, anonKey, { cookieOptions: SUPABASE_COOKIE_OPTIONS });
}
