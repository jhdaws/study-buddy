// Supabase client authenticated with the SECRET key. Owner: Track M -- M3 (#24).
//
// It bypasses Row Level Security on EVERY table. ADR 0008 rule 12 allows it
// for one job: resolvePlace() (src/lib/places.ts) writing `locations` after
// it has checked the place with Google. Nothing else may import this --
// sessions, rosters, profiles and courses go through the per-request client
// in server.ts, under RLS, as the signed-in user. If you need it for anything
// else, that is an ADR change, not an import.
//
// `import "server-only"` makes importing this from a Client Component a build
// error. The key itself is SUPABASE_SECRET_KEY, never NEXT_PUBLIC_ (env.ts).
//
// No cookies and no user: this client acts as the service role, not as
// whoever made the request, so it must never be used to read data back to a
// user either -- it would show them rows RLS hides.

import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { supabaseEnv, supabaseSecretKey } from "@/lib/env";

/** A fresh secret-key client. Call per use; it holds no session to share. */
export function createAdminClient() {
  const { url } = supabaseEnv();
  return createClient<Database>(url, supabaseSecretKey(), {
    auth: {
      // Nothing to persist or refresh: there is no signed-in user here.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
