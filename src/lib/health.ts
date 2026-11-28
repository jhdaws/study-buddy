// What GET /api/health reports (V5, #151). The route in
// src/app/api/health/route.ts only wires this to the database and to HTTP,
// so everything a reader of the JSON relies on is unit tested here.
//
// WHO READS IT
//   - the smoke tests after every staging deploy (V4, #150): "the database is
//     reachable";
//   - the uptime check on production (V7, #153), which alerts on anything
//     but a 200;
//   - a person after a release or a rollback (docs/ops/RUNBOOK.md): "is the
//     new version live?".
//
// THE BODY -- keep these keys; the smoke tests and the runbook read them:
//   { "status": "ok" | "error",
//     "version": "1.0.0",                 package.json
//     "commit": "<40-hex sha>" | null,     the deployed commit
//     "environment": "production" | "staging" | "preview" | "development" | ...,
//     "database": "reachable" | "unreachable",
//     "checkedAt": "<ISO time>" }
// 200 when the database answered, 503 when it did not, so a monitor that
// only looks at the status code still alerts.
//
// WHAT NEVER GOES IN: a key, a URL with a project ref, a user, or the
// database's own error text. Everything here is safe to show anyone, because
// the endpoint is public (an uptime monitor has no account). The reason a
// check failed goes to the server log instead.

import packageJson from "../../package.json";

/** The environment variables read here; `process.env` fits. */
export type Env = Readonly<Record<string, string | undefined>>;

/** The JSON /api/health returns. */
export type HealthBody = {
  status: "ok" | "error";
  version: string;
  commit: string | null;
  environment: string;
  database: "reachable" | "unreachable";
  checkedAt: string;
};

/** Long enough for a cold Supabase; short enough that a monitor gets an answer. */
export const DATABASE_TIMEOUT_MS = 3000;

/** A full git SHA. Anything else in the variable is reported as unknown. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** A deployment name like "staging": letters, digits and dashes. */
const ENVIRONMENT_NAME = /^[a-z0-9-]{1,32}$/;

/**
 * The deployed commit. deploy.yml sets APP_COMMIT_SHA on each deployment,
 * because Vercel's own VERCEL_GIT_COMMIT_SHA exists only for Vercel's Git
 * deploys, which vercel.json turns off (V3, #149). The second is kept for a
 * deployment made any other way. Null when neither is a real SHA -- a local
 * run, or the Docker image.
 */
export function deployedCommit(env: Env): string | null {
  for (const value of [env.APP_COMMIT_SHA, env.VERCEL_GIT_COMMIT_SHA]) {
    const sha = value?.trim().toLowerCase();
    if (sha && COMMIT_SHA.test(sha)) return sha;
  }
  return null;
}

/**
 * Which deployment this is. APP_ENVIRONMENT (set by deploy.yml) says
 * "staging" where Vercel would only say "preview".
 */
export function deployedEnvironment(env: Env): string {
  for (const value of [env.APP_ENVIRONMENT, env.VERCEL_ENV, env.NODE_ENV]) {
    const name = value?.trim().toLowerCase();
    if (name && ENVIRONMENT_NAME.test(name)) return name;
  }
  return "unknown";
}

/** The outcome of one database round trip. `reason` is for the log only. */
export type DatabaseCheck = { reachable: true } | { reachable: false; reason: string };

/**
 * Runs `ping` and turns any failure -- a refusal, an exception, a timeout --
 * into `reachable: false` with a short reason code. Never throws.
 */
export async function checkDatabase(
  ping: (signal: AbortSignal) => PromiseLike<{ error: { code?: string } | null; data: unknown }>,
  timeoutMs: number = DATABASE_TIMEOUT_MS,
): Promise<DatabaseCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data, error } = await ping(controller.signal);
    if (controller.signal.aborted) return { reachable: false, reason: "timeout" };
    if (error) return { reachable: false, reason: reasonCode(error.code) };
    if (data !== true) return { reachable: false, reason: "unexpected_result" };
    return { reachable: true };
  } catch {
    return {
      reachable: false,
      reason: controller.signal.aborted ? "timeout" : "request_failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A Postgres/PostgREST code as a log-safe word, e.g. "sqlstate_42501".
 * supabase-js reports a failed fetch (nothing answered) with an empty code.
 */
function reasonCode(code: string | undefined): string {
  if (!code) return "request_failed";
  return /^[A-Za-z0-9]{1,10}$/.test(code) ? `sqlstate_${code.toLowerCase()}` : "invalid_code";
}

/** The response: body and HTTP status. */
export function healthResponse(
  database: DatabaseCheck,
  env: Env,
  now: Date = new Date(),
): { body: HealthBody; status: 200 | 503 } {
  const body: HealthBody = {
    status: database.reachable ? "ok" : "error",
    version: packageJson.version,
    commit: deployedCommit(env),
    environment: deployedEnvironment(env),
    database: database.reachable ? "reachable" : "unreachable",
    checkedAt: now.toISOString(),
  };
  return { body, status: database.reachable ? 200 : 503 };
}
