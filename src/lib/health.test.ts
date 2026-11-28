// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import packageJson from "../../package.json";
import {
  checkDatabase,
  deployedCommit,
  deployedEnvironment,
  healthResponse,
  type HealthBody,
} from "./health";

// The /api/health body and status (V5, #151). The smoke tests (V4) and the
// uptime check (V7) depend on these keys and on the 503; the route's wiring
// is in src/app/api/health/route.test.ts.

const SHA = "0e53f9d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7";
const NOW = new Date("2026-12-01T15:00:00.000Z");

afterEach(() => {
  vi.useRealTimers();
});

describe("deployedCommit", () => {
  it("prefers APP_COMMIT_SHA, which deploy.yml sets", () => {
    expect(deployedCommit({ APP_COMMIT_SHA: SHA, VERCEL_GIT_COMMIT_SHA: "f".repeat(40) })).toBe(SHA);
  });

  it("falls back to Vercel's own variable", () => {
    expect(deployedCommit({ VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() })).toBe(SHA);
  });

  it("is null for a local run, and for anything that is not a full SHA", () => {
    expect(deployedCommit({})).toBeNull();
    expect(deployedCommit({ APP_COMMIT_SHA: "0e53f9d" })).toBeNull();
    expect(deployedCommit({ APP_COMMIT_SHA: `${SHA}\n{"forged":true}` })).toBeNull();
  });
});

describe("deployedEnvironment", () => {
  it("says staging where Vercel would only say preview", () => {
    expect(deployedEnvironment({ APP_ENVIRONMENT: "staging", VERCEL_ENV: "preview" })).toBe("staging");
  });

  it("falls back to VERCEL_ENV, then NODE_ENV", () => {
    expect(deployedEnvironment({ VERCEL_ENV: "production" })).toBe("production");
    expect(deployedEnvironment({ NODE_ENV: "development" })).toBe("development");
  });

  it("never echoes an odd value", () => {
    expect(deployedEnvironment({ APP_ENVIRONMENT: "<script>" })).toBe("unknown");
    expect(deployedEnvironment({})).toBe("unknown");
  });
});

describe("checkDatabase", () => {
  it("is reachable when health_check() returns true", async () => {
    await expect(checkDatabase(async () => ({ data: true, error: null }))).resolves.toEqual({
      reachable: true,
    });
  });

  it("is unreachable, with the SQLSTATE as a code, when the database refuses", async () => {
    const check = await checkDatabase(async () => ({
      data: null,
      error: { code: "42501", message: "permission denied for function health_check" },
    }));
    expect(check).toEqual({ reachable: false, reason: "sqlstate_42501" });
  });

  it("calls a failed request request_failed, not the error's text", async () => {
    const check = await checkDatabase(async () => ({
      data: null,
      error: { code: "", message: "TypeError: fetch failed" },
    }));
    expect(check).toEqual({ reachable: false, reason: "request_failed" });
  });

  it("does not trust an odd code", async () => {
    const check = await checkDatabase(async () => ({ data: null, error: { code: "not a code!" } }));
    expect(check).toEqual({ reachable: false, reason: "invalid_code" });
  });

  it("is unreachable when the answer is not true", async () => {
    const check = await checkDatabase(async () => ({ data: null, error: null }));
    expect(check).toEqual({ reachable: false, reason: "unexpected_result" });
  });

  it("is unreachable when the call throws", async () => {
    const check = await checkDatabase(async () => {
      throw new Error("socket hang up");
    });
    expect(check).toEqual({ reachable: false, reason: "request_failed" });
  });

  it("gives up after the timeout and aborts the request", async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const pending = checkDatabase((signal) => {
      seen = signal;
      // A database that never answers, until the request is aborted.
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    }, 3000);

    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toEqual({ reachable: false, reason: "timeout" });
    expect(seen?.aborted).toBe(true);
  });

  it("counts an answer that arrives only after the abort as a timeout", async () => {
    vi.useFakeTimers();
    const pending = checkDatabase(
      (signal) =>
        // supabase-js resolves (not rejects) an aborted request with an error.
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve({ data: null, error: { code: "" } })),
        ),
      3000,
    );

    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toEqual({ reachable: false, reason: "timeout" });
  });
});

describe("healthResponse", () => {
  it("is 200 with every key when the database answers", () => {
    const { body, status } = healthResponse(
      { reachable: true },
      { APP_COMMIT_SHA: SHA, APP_ENVIRONMENT: "staging" },
      NOW,
    );

    expect(status).toBe(200);
    expect(body).toEqual<HealthBody>({
      status: "ok",
      version: packageJson.version,
      commit: SHA,
      environment: "staging",
      database: "reachable",
      checkedAt: "2026-12-01T15:00:00.000Z",
    });
  });

  it("is 503 when the database does not, so a status-only monitor still alerts", () => {
    const { body, status } = healthResponse({ reachable: false, reason: "timeout" }, {}, NOW);

    expect(status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.database).toBe("unreachable");
  });

  it("never puts the failure reason, a key or a URL in the public body", () => {
    const env = {
      APP_COMMIT_SHA: SHA,
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijkl.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_secretish",
      SUPABASE_SECRET_KEY: "sb_secret_really",
    };
    const { body } = healthResponse({ reachable: false, reason: "sqlstate_42501" }, env, NOW);
    const text = JSON.stringify(body);

    expect(Object.keys(body).sort()).toEqual(
      ["checkedAt", "commit", "database", "environment", "status", "version"],
    );
    for (const leak of ["sqlstate", "supabase.co", "sb_publishable", "sb_secret"]) {
      expect(text).not.toContain(leak);
    }
  });
});
