// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

// GET /api/health (V5, #151) with Supabase replaced. What the body means is
// tested in src/lib/health.test.ts; that public.health_check() exists and
// anon may call it is tested against real Postgres in tests/db/health-check.test.ts.

const fakes = vi.hoisted(() => ({
  createClient: vi.fn(),
  rpc: vi.fn(),
  abortSignal: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: fakes.createClient }));

const SHA = "0e53f9d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6f7";
let logged: string[];

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijkl.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_publishable_test");
  vi.stubEnv("APP_COMMIT_SHA", SHA);
  vi.stubEnv("APP_ENVIRONMENT", "staging");
  fakes.abortSignal.mockResolvedValue({ data: true, error: null });
  fakes.rpc.mockReturnValue({ abortSignal: fakes.abortSignal });
  fakes.createClient.mockReturnValue({ rpc: fakes.rpc });
  logged = [];
  vi.spyOn(console, "error").mockImplementation((line: string) => {
    logged.push(line);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const fake of Object.values(fakes)) fake.mockReset();
});

describe("GET /api/health", () => {
  it("answers 200, never cached, after one call to health_check()", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      status: "ok",
      commit: SHA,
      environment: "staging",
      database: "reachable",
    });
    expect(fakes.rpc).toHaveBeenCalledExactlyOnceWith("health_check");
    expect(fakes.abortSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
    expect(logged).toEqual([]);
  });

  it("uses a cookie-less anon client that keeps no session", async () => {
    await GET();

    expect(fakes.createClient).toHaveBeenCalledWith(
      "https://abcdefghijkl.supabase.co",
      "sb_publishable_test",
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  });

  it("answers 503 when the database is down, and logs a code, not the error text", async () => {
    fakes.abortSignal.mockResolvedValue({
      data: null,
      error: { code: "", message: "TypeError: fetch failed for https://abcdefghijkl.supabase.co" },
    });

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "error", database: "unreachable" });
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0])).toEqual({
      log: "health",
      event: "database_unreachable",
      reason: "request_failed",
    });
    expect(logged[0]).not.toContain("supabase.co");
  });

  it("answers 503, not a crash, when the deployment has no Supabase settings", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(fakes.createClient).not.toHaveBeenCalled();
    expect(JSON.parse(logged[0]).reason).toBe("not_configured");
  });
});
