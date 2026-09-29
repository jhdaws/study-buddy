// Supabase client for Client Components and realtime subscriptions.
//
// Client Components import this; it must never be used on the server, where
// each request needs its own cookie-bound client (see server.ts).

import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnv } from "@/lib/env";

export function createClient() {
  const { url, anonKey } = supabaseEnv();
  // createBrowserClient reuses one instance per page, so calling this from
  // several components does not open several realtime connections.
  return createBrowserClient(url, anonKey);
}
