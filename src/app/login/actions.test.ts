// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeNext } from "@/lib/safe-next";

import { saveDisplayName, signIn, signOut, verifyCode } from "./actions";

// Everything the actions reach outside themselves is replaced: the request
// headers, redirect(), and the cookie-bound Supabase client.
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

class Redirect extends Error {
  constructor(readonly path: string) {
    super(`redirect to ${path}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirect(path);
  },
}));

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));
const server = vi.hoisted(() => ({
  // profiles.update(...).eq(...).select(...) -- the chain saveDisplayName uses.
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  user: null as { id: string } | null,
  pathAfterSignIn: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth,
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`unexpected table ${table}`);
      return { update: server.update };
    },
  };
  server.update.mockImplementation(() => ({ eq: server.eq }));
  server.eq.mockImplementation(() => ({ select: server.select }));
  return {
    createClient: async () => client,
    getCurrentUser: async () => server.user,
    pathAfterSignIn: (...args: unknown[]) => server.pathAfterSignIn(...args),
  };
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Redirect);
  return (error as Redirect).path;
}

beforeEach(() => {
  requestHeaders.current = new Headers({ origin: "https://study-buddy-jdaws.vercel.app" });
  server.user = null;
  // The real one also checks for a display name; see server.test.ts.
  server.pathAfterSignIn.mockImplementation(async (_client, _id, next) => safeNext(next));
  server.update.mockImplementation(() => ({ eq: server.eq }));
  server.eq.mockImplementation(() => ({ select: server.select }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("signIn", () => {
  it("sends the email with a link back to /auth/confirm on this origin", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    const state = await signIn({}, form({ email: " Jane@Vanderbilt.EDU ", next: "/sessions/new" }));

    expect(state).toEqual({ sentTo: "jane@vanderbilt.edu" });
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "jane@vanderbilt.edu",
      options: {
        emailRedirectTo:
          "https://study-buddy-jdaws.vercel.app/auth/confirm?next=%2Fsessions%2Fnew",
        shouldCreateUser: true,
      },
    });
  });

  it("always puts a query string on the redirect, which the email template appends to", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    requestHeaders.current = new Headers({ host: "localhost:3000" });
    await signIn({}, form({ email: "jane@vanderbilt.edu" }));
    expect(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "http://localhost:3000/auth/confirm?next=%2Fsessions",
    );
  });

  it("drops an off-site next", async () => {
    auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
    await signIn({}, form({ email: "jane@vanderbilt.edu", next: "https://evil.example" }));
    const redirectTo = new URL(auth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo);
    expect(redirectTo.origin).toBe("https://study-buddy-jdaws.vercel.app");
    expect(redirectTo.searchParams.get("next")).toBe("/sessions");
  });

  it("refuses another domain before calling Supabase", async () => {
    const state = await signIn({}, form({ email: "jane@gmail.com" }));
    expect(state.fieldErrors?.email).toEqual(["Use your @vanderbilt.edu email address."]);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("maps a Supabase error to our own message and keeps the address", async () => {
    auth.signInWithOtp.mockResolvedValue({
      data: {},
      error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" },
    });
    const state = await signIn({}, form({ email: "jane@vanderbilt.edu" }));
    expect(state.sentTo).toBeUndefined();
    expect(state.formError).toMatch(/Wait a minute/);
    expect(state.formError).not.toMatch(/rate limit exceeded/);
    expect(state.values?.email).toBe("jane@vanderbilt.edu");
  });
});

describe("verifyCode", () => {
  it("checks the code for that address and goes on to next", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const path = await redirectOf(
      verifyCode(
        {},
        form({ email: "jane@vanderbilt.edu", code: "123 456", next: "/sessions/new" }),
      ),
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "jane@vanderbilt.edu",
      token: "123456",
      type: "email",
    });
    expect(path).toBe("/sessions/new");
  });

  it("sends a first-time student to the name step (A4)", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    server.pathAfterSignIn.mockResolvedValue("/login/name?next=%2Fsessions%2Fnew");
    const path = await redirectOf(
      verifyCode({}, form({ email: "jane@vanderbilt.edu", code: "123456", next: "/sessions/new" })),
    );
    expect(server.pathAfterSignIn).toHaveBeenCalledWith(expect.anything(), "u1", "/sessions/new");
    expect(path).toBe("/login/name?next=%2Fsessions%2Fnew");
  });

  it("never redirects off-site", async () => {
    auth.verifyOtp.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const path = await redirectOf(
      verifyCode({}, form({ email: "jane@vanderbilt.edu", code: "123456", next: "//evil.example" })),
    );
    expect(path).toBe("/sessions");
  });

  it("returns a field error for a malformed code without calling Supabase", async () => {
    const state = await verifyCode({}, form({ email: "jane@vanderbilt.edu", code: "12ab" }));
    expect(state.fieldErrors?.code?.[0]).toMatch(/digits only/);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("maps a refused code to our own message", async () => {
    auth.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired", status: 403, message: "Token has expired or is invalid" },
    });
    const state = await verifyCode({}, form({ email: "jane@vanderbilt.edu", code: "123456" }));
    expect(state.formError).toMatch(/didn't work/);
    expect(state.formError).not.toMatch(/Token/);
    expect(state.values?.code).toBe("123456");
  });
});

describe("saveDisplayName", () => {
  beforeEach(() => {
    server.user = { id: "u1" };
  });

  it("saves the trimmed name on the caller's own row, then goes on to next", async () => {
    server.select.mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const path = await redirectOf(
      saveDisplayName({}, form({ displayName: "  Priya  ", next: "/sessions/new" })),
    );
    expect(server.update).toHaveBeenCalledWith({ display_name: "Priya" });
    expect(server.eq).toHaveBeenCalledWith("id", "u1");
    expect(path).toBe("/sessions/new");
  });

  it("never redirects off-site", async () => {
    server.select.mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const path = await redirectOf(
      saveDisplayName({}, form({ displayName: "Priya", next: "https://evil.example" })),
    );
    expect(path).toBe("/sessions");
  });

  it("sends a signed-out caller to /login without touching the database", async () => {
    server.user = null;
    const path = await redirectOf(
      saveDisplayName({}, form({ displayName: "Priya", next: "/sessions/new" })),
    );
    expect(path).toBe("/login?next=%2Fsessions%2Fnew");
    expect(server.update).not.toHaveBeenCalled();
  });

  it("returns field errors for a blank name", async () => {
    const state = await saveDisplayName({}, form({ displayName: "   " }));
    expect(state.fieldErrors?.displayName).toEqual(["Enter a display name."]);
    expect(server.update).not.toHaveBeenCalled();
  });

  it("maps a database refusal to our own message", async () => {
    server.select.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: 'new row for relation "profiles" violates check constraint "profiles_display_name_check"',
      },
    });
    const state = await saveDisplayName({}, form({ displayName: "Priya" }));
    expect(state.formError).toMatch(/1 to 50 characters/);
    expect(state.formError).not.toMatch(/violates/);
    expect(state.values?.displayName).toBe("Priya");
  });

  it("does not pretend to have saved when no row was updated", async () => {
    server.select.mockResolvedValue({ data: [], error: null });
    const state = await saveDisplayName({}, form({ displayName: "Priya" }));
    expect(state.formError).toMatch(/couldn't find your profile/);
  });
});

describe("signOut", () => {
  it("ends this device's session, then goes home", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    const path = await redirectOf(signOut());
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(path).toBe("/");
  });
});
