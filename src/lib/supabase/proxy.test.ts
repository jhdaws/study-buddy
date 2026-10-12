// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_PATH_HEADER } from "@/lib/safe-next";

import { isProtectedPath, updateSession } from "./proxy";

// createServerClient is replaced by a fake whose getUser() the test
// controls, and which -- like the real one refreshing a token -- can call
// setAll() with new cookies and no-cache headers first.
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

function request(path: string, method = "GET") {
  return new NextRequest(`${ORIGIN}${path}`, { method });
}

const REFRESHED = {
  cookies: [
    { name: "sb-test-auth-token", value: "new-token", options: { path: "/", httpOnly: true } },
  ],
  headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder-anon-key");
  fake.user = null;
  fake.refresh = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isProtectedPath", () => {
  it("covers /sessions and everything under it, nothing else", () => {
    for (const path of ["/sessions", "/sessions/new", "/sessions/123"]) {
      expect(isProtectedPath(path), path).toBe(true);
    }
    for (const path of ["/", "/login", "/login/name", "/auth/confirm", "/api/courses", "/sessionsx"]) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });
});

describe("updateSession", () => {
  it("sends a signed-out visitor from /sessions/new to /login, keeping where they were going", async () => {
    const response = await updateSession(request("/sessions/new?course=CS"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/sessions/new?course=CS");
  });

  it("copies refreshed cookies and no-cache headers onto the redirect", async () => {
    // E.g. an expired session: Supabase clears the cookie, then reports no user.
    fake.refresh = {
      cookies: [{ name: "sb-test-auth-token", value: "", options: { path: "/", maxAge: 0 } }],
      headers: REFRESHED.headers,
    };
    const response = await updateSession(request("/sessions"));
    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-test-auth-token")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("lets a signed-in student through, with the refreshed cookies", async () => {
    fake.user = { id: "u1" };
    fake.refresh = REFRESHED;
    const response = await updateSession(request("/sessions/new"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("new-token");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each(["/", "/login", "/login/name", "/auth/confirm?token_hash=x", "/api/courses?department=CS"])(
    "leaves %s alone for a signed-out visitor",
    async (path) => {
      const response = await updateSession(request(path));
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it("does not redirect a POST: a Server Action checks for itself", async () => {
    const response = await updateSession(request("/sessions/new", "POST"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("forwards the requested path to the app, overwriting any the client sent", async () => {
    fake.user = { id: "u1" };
    const incoming = request("/sessions/new?x=1");
    incoming.headers.set(REQUEST_PATH_HEADER, "https://evil.example");
    const response = await updateSession(incoming);
    // NextResponse.next({ request }) passes overridden request headers on
    // as x-middleware-request-* headers.
    expect(response.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)).toBe(
      "/sessions/new?x=1",
    );
  });
});
