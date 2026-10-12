// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { safeNext } from "@/lib/safe-next";
import { createClient, pathAfterSignIn } from "@/lib/supabase/server";

import { GET } from "./route";

// The route's dependencies are the cookie-bound Supabase client, replaced
// with one whose verifyOtp() the test controls, and pathAfterSignIn() (the
// name-step check, tested in server.test.ts), which by default just applies
// safeNext() as it does for a student who has a name.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), pathAfterSignIn: vi.fn() }));

const verifyOtp = vi.fn();

function mockClient() {
  vi.mocked(createClient).mockResolvedValue({ auth: { verifyOtp } } as never);
  if (!vi.mocked(pathAfterSignIn).getMockImplementation()) {
    vi.mocked(pathAfterSignIn).mockImplementation(async (_client, _id, next) => safeNext(next));
  }
}

const ORIGIN = "https://study-buddy-jdaws.vercel.app";

async function visit(query: string) {
  mockClient();
  const response = await GET(new NextRequest(`${ORIGIN}/auth/confirm?${query}`));
  const location = response.headers.get("location");
  return { response, location: location ? new URL(location) : null };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/confirm", () => {
  it("verifies the token and goes on to a same-origin next", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { response, location } = await visit(
      "next=%2Fsessions%2Fnew&token_hash=abc123&type=email",
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc123" });
    expect(response.status).toBe(303);
    expect(location?.origin).toBe(ORIGIN);
    expect(location?.pathname).toBe("/sessions/new");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("sends a first-time student to the name step (A4)", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    vi.mocked(pathAfterSignIn).mockResolvedValueOnce("/login/name?next=%2Fsessions%2Fnew");
    const { location } = await visit("next=%2Fsessions%2Fnew&token_hash=abc123&type=email");

    expect(vi.mocked(pathAfterSignIn)).toHaveBeenCalledWith(expect.anything(), "u1", "/sessions/new");
    expect(location?.origin).toBe(ORIGIN);
    expect(location?.pathname).toBe("/login/name");
    expect(location?.searchParams.get("next")).toBe("/sessions/new");
  });

  it("defaults to /sessions without a next", async () => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { location } = await visit("token_hash=abc123&type=email");
    expect(location?.href).toBe(`${ORIGIN}/sessions`);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
  ])("never redirects off-site, even for next=%j", async (next) => {
    verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { location } = await visit(
      `next=${encodeURIComponent(next)}&token_hash=abc123&type=email`,
    );
    expect(location?.origin).toBe(ORIGIN);
    expect(location?.pathname).toBe("/sessions");
  });

  it("sends a failed link back to /login with the error flag, keeping next", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired", status: 403, message: "Email link is invalid or has expired" },
    });
    const { location } = await visit("next=%2Fsessions%2Fnew&token_hash=used&type=email");

    expect(location?.origin).toBe(ORIGIN);
    expect(location?.pathname).toBe("/login");
    expect(location?.searchParams.get("error")).toBe("link");
    expect(location?.searchParams.get("next")).toBe("/sessions/new");
    // Supabase's own text never travels in the URL.
    expect(location?.search).not.toMatch(/expired|invalid/i);
  });

  it.each([
    ["no token", "type=email"],
    ["no type", "token_hash=abc123"],
    ["a type we never send", "token_hash=abc123&type=recovery"],
  ])("rejects %s without calling Supabase", async (_case, query) => {
    const { location } = await visit(query);
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location?.pathname).toBe("/login");
    expect(location?.searchParams.get("error")).toBe("link");
  });
});
