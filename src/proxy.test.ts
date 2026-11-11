// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NONCE_HEADER } from "@/lib/security-headers";

import { proxy } from "./proxy";

// The session half is tested in src/lib/supabase/proxy.test.ts; here the
// Supabase client is a fake that can refresh cookies, so these tests check
// that adding the CSP keeps them.
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };
type SetAll = (cookies: CookieToSet[], headers: Record<string, string>) => void;

const fake = vi.hoisted(() => ({
  user: null as { id: string } | null,
  refresh: null as null | { cookies: CookieToSet[]; headers: Record<string, string> },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: SetAll } }) => ({
    auth: {
      getUser: async () => {
        if (fake.refresh) options.cookies.setAll(fake.refresh.cookies, fake.refresh.headers);
        return { data: { user: fake.user }, error: null };
      },
    },
  }),
}));

const ORIGIN = "https://study-buddy-jdaws.vercel.app";

function request(path: string): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`);
}

/** The nonce in a policy's script-src. */
function nonceOf(policy: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(policy ?? "")?.[1];
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefgh.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder-anon-key");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
  fake.user = null;
  fake.refresh = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("sends the CSP to the browser and the same one, with its nonce, on to the app", async () => {
    fake.user = { id: "u1" };
    const response = await proxy(request("/sessions"));

    const policy = response.headers.get("content-security-policy");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("wss://abcdefgh.supabase.co");
    // NextResponse.next({ request }) passes request headers on as
    // x-middleware-request-*: Next reads the nonce from this one to render.
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(response.headers.get(`x-middleware-request-${NONCE_HEADER}`)).toBe(nonceOf(policy));
  });

  it("uses a new nonce for every request, and overwrites any the client sent", async () => {
    const incoming = request("/");
    incoming.headers.set("content-security-policy", "script-src 'nonce-chosen-by-client'");
    incoming.headers.set(NONCE_HEADER, "chosen-by-client");
    const first = await proxy(incoming);
    const second = await proxy(request("/"));

    const nonce = nonceOf(first.headers.get("content-security-policy"));
    expect(nonce).toBeTruthy();
    expect(nonce).not.toBe("chosen-by-client");
    expect(first.headers.get(`x-middleware-request-${NONCE_HEADER}`)).toBe(nonce);
    expect(nonceOf(second.headers.get("content-security-policy"))).not.toBe(nonce);
  });

  it("keeps refreshed cookies, and puts the CSP on the redirect to sign-in too", async () => {
    fake.refresh = {
      cookies: [{ name: "sb-test-auth-token", value: "", options: { path: "/", maxAge: 0 } }],
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
    };
    const response = await proxy(request("/sessions/new"));

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-test-auth-token")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("keeps refreshed cookies on a page that is let through", async () => {
    fake.user = { id: "u1" };
    fake.refresh = {
      cookies: [{ name: "sb-test-auth-token", value: "new-token", options: { path: "/" } }],
      headers: {},
    };
    const response = await proxy(request("/sessions/new"));
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new-token");
    expect(response.headers.get("content-security-policy")).toBeTruthy();
  });

  it("allows Google's Maps hosts only when there is a browser key", async () => {
    const without = (await proxy(request("/"))).headers.get("content-security-policy");
    expect(without).not.toContain("googleapis.com");

    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "browser-key");
    const withKey = (await proxy(request("/"))).headers.get("content-security-policy");
    expect(withKey).toContain("https://*.googleapis.com");
    expect(withKey).toContain("worker-src blob:");
    expect(withKey).toContain("'wasm-unsafe-eval'");
    expect(without).not.toContain("'wasm-unsafe-eval'");
  });

  it("allows eval only under `next dev`", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await proxy(request("/"))).headers.get("content-security-policy")).not.toContain(
      "'unsafe-eval'",
    );
    vi.stubEnv("NODE_ENV", "development");
    expect((await proxy(request("/"))).headers.get("content-security-policy")).toContain(
      "'unsafe-eval'",
    );
  });
});
