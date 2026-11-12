// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_MAX_AGE_SECONDS, SUPABASE_COOKIE_OPTIONS } from "@/lib/limits";

// SEC-16: every Supabase client the app creates passes the same cookie
// lifetime, so no path quietly falls back to @supabase/ssr's 400 days.
// @supabase/ssr is replaced by fakes that record the options they get.

const seen = vi.hoisted(() => ({ options: [] as unknown[] }));

vi.mock("@supabase/ssr", () => {
  const fakeClient = {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  };
  return {
    createServerClient: (_url: string, _key: string, options: unknown) => {
      seen.options.push(options);
      return fakeClient;
    },
    createBrowserClient: (_url: string, _key: string, options: unknown) => {
      seen.options.push(options);
      return fakeClient;
    },
  };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => new Headers(),
}));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder-anon-key");
  seen.options.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Supabase auth cookie lifetime (SEC-16)", () => {
  it("is 7 days, not @supabase/ssr's 400", () => {
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBe(7 * 24 * 60 * 60);
    expect(SUPABASE_COOKIE_OPTIONS).toEqual({ maxAge: SESSION_COOKIE_MAX_AGE_SECONDS });
  });

  it("is passed by the server, proxy and browser clients", async () => {
    const { createClient: createServerSideClient } = await import("./server");
    const { updateSession } = await import("./proxy");
    const { createClient: createBrowserSideClient } = await import("./client");

    await createServerSideClient();
    await updateSession(new NextRequest("http://localhost:3000/"));
    createBrowserSideClient();

    expect(seen.options).toHaveLength(3);
    for (const options of seen.options) {
      expect(options).toMatchObject({ cookieOptions: { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS } });
    }
  });
});
