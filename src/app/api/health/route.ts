// GET /api/health -- is this deployment up, which version is it, and does
// the database answer? (V5, #151). What the body means, and who reads it, is
// in src/lib/health.ts; this file only connects it to Supabase and to HTTP.
//
// No sign-in, on purpose: the uptime monitor (V7) and the smoke tests (V4)
// have no account. That is why the body says nothing about any user, and why
// the database check is a call to public.health_check(), which reads no table
// (supabase/migrations/20261128053622_health_check.sql).
//
// The client is a plain anon client with no cookies, not the cookie-bound one
// in @/lib/supabase/server: a health check should not depend on, refresh or
// set anyone's session.
//
// Route Handlers are not cached in Next 16 unless they opt in, so every
// request runs the check. `no-store` stops a CDN or browser keeping an old
// answer -- a cached "ok" during an outage is the one thing this must not do.

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { supabaseEnv } from "@/lib/env";
import { checkDatabase, healthResponse, type DatabaseCheck } from "@/lib/health";

export async function GET() {
  const database = await pingDatabase();
  if (!database.reachable) {
    // A code, never the error's own text (src/lib/security-log.ts explains why).
    console.error(JSON.stringify({ log: "health", event: "database_unreachable", reason: database.reason }));
  }

  const { body, status } = healthResponse(database, process.env);
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function pingDatabase(): Promise<DatabaseCheck> {
  let env: { url: string; anonKey: string };
  try {
    env = supabaseEnv();
  } catch {
    // Misconfigured deployment: say so as "unreachable", not as a 500 page.
    return { reachable: false, reason: "not_configured" };
  }

  const supabase = createClient<Database>(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return checkDatabase((signal) => supabase.rpc("health_check").abortSignal(signal));
}
