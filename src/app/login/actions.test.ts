// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { safeNext } from "@/lib/safe-next";

import {
  saveDisplayName,
  setPassword,
  signIn,
  signInWithPassword,
  signOut,
  verifyCode,
} from "./actions";

// Everything the actions reach outside themselves is replaced: the request
// headers, redirect(), and the cookie-bound Supabase client.
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

class Redirect extends Error {
  constructor(readonly path: string) {
    super(`redirect to ${path}`);
  }
}
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Redirect(path);
  },
}));

const auth = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));
const server = vi.hoisted(() => ({
  // profiles.update(...).eq(...).select(...) -- the chain saveDisplayName uses.
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  user: null as { id: string; user_metadata?: Record<string, unknown> } | null,
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
    HAS_PASSWORD: "has_password",
    hasPassword: (user: { user_metadata?: Record<string, unknown> }) =>
      user.user_metadata?.has_password === true,
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
  vi.unstubAllEnvs();
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
    expect(state.formError).toMatch(/Try again in a few minutes/);
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
    expect(server.pathAfterSignIn).toHaveBeenCalledWith(
      expect.anything(),
      { id: "u1" },
      "/sessions/new",
      { choosePassword: true },
    );
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

describe("signInWithPassword", () => {
  const signedIn = (metadata: Record<string, unknown> = { has_password: true }) => ({
    data: { user: { id: "u1", user_metadata: metadata } },
    error: null,
  });

  it("signs in with the address and password, and goes on to next -- no email", async () => {
    auth.signInWithPassword.mockResolvedValue(signedIn());
    const path = await redirectOf(
      signInWithPassword(
        {},
        form({ email: " Jane@Vanderbilt.EDU ", password: "correct horse", next: "/sessions/new" }),
      ),
    );
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "jane@vanderbilt.edu",
      password: "correct horse",
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(path).toBe("/sessions/new");
  });

  it("does not trim the password: a space is part of it", async () => {
    auth.signInWithPassword.mockResolvedValue(signedIn());
    await redirectOf(signInWithPassword({}, form({ email: "jane@vanderbilt.edu", password: " pw " })));
    expect(auth.signInWithPassword.mock.calls[0][0].password).toBe(" pw ");
  });

  it("records the password for an account given one outside the app", async () => {
    auth.signInWithPassword.mockResolvedValue(signedIn({}));
    auth.updateUser.mockResolvedValue({
      data: { user: { id: "u1", user_metadata: { has_password: true } } },
      error: null,
    });
    await redirectOf(signInWithPassword({}, form({ email: "jane@vanderbilt.edu", password: "pw" })));
    expect(auth.updateUser).toHaveBeenCalledWith({ data: { has_password: true } });
    expect(server.pathAfterSignIn).toHaveBeenCalledWith(
      expect.anything(),
      { id: "u1", user_metadata: { has_password: true } },
      null,
    );
  });

  it("maps a wrong password to our own message, without saying whether the account exists", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" },
    });
    const state = await signInWithPassword(
      {},
      form({ email: "jane@vanderbilt.edu", password: "wrong" }),
    );
    expect(state.formError).toMatch(/don't match/);
    expect(state.formError).not.toMatch(/Invalid login/);
    expect(state.values).toEqual({ email: "jane@vanderbilt.edu" });
  });

  it("refuses another domain, and an empty password, before calling Supabase", async () => {
    const state = await signInWithPassword({}, form({ email: "jane@gmail.com", password: "" }));
    expect(state.fieldErrors?.email).toEqual(["Use your @vanderbilt.edu email address."]);
    expect(state.fieldErrors?.password).toEqual(["Enter your password."]);
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("never sends the password back to the browser", async () => {
    const state = await signInWithPassword({}, form({ email: "jane@gmail.com", password: "secret" }));
    expect(state.values).toEqual({ email: "jane@gmail.com" });
  });
});

describe("setPassword", () => {
  beforeEach(() => {
    server.user = { id: "u1", user_metadata: {} };
  });

  it("sets the password and the flag together, then goes on to next", async () => {
    auth.updateUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const path = await redirectOf(
      setPassword(
        {},
        form({ password: "a long one", confirmPassword: "a long one", next: "/sessions/new" }),
      ),
    );
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "a long one",
      data: { has_password: true },
    });
    expect(path).toBe("/sessions/new");
  });

  it("refuses a short password, or two that differ, without calling Supabase or echoing them", async () => {
    let state = await setPassword({}, form({ password: "short", confirmPassword: "short" }));
    expect(state.fieldErrors?.password).toEqual(["Use at least 8 characters."]);
    expect(state.values?.password).toBeUndefined();

    state = await setPassword({}, form({ password: "a long one", confirmPassword: "a long two" }));
    expect(state.fieldErrors?.confirmPassword).toEqual(["The two passwords don't match."]);
    expect(state.values).toEqual({});
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("maps Supabase's refusal to our own message", async () => {
    auth.updateUser.mockResolvedValue({
      data: { user: null },
      error: { code: "same_password", status: 422, message: "New password should be different" },
    });
    const state = await setPassword({}, form({ password: "a long one", confirmPassword: "a long one" }));
    expect(state.formError).toMatch(/already your password/);
    expect(state.formError).not.toMatch(/should be different/);
  });

  it("sends a signed-out caller to /login", async () => {
    server.user = null;
    const path = await redirectOf(
      setPassword({}, form({ password: "a long one", confirmPassword: "a long one", next: "/sessions/new" })),
    );
    expect(path).toBe("/login?next=%2Fsessions%2Fnew");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});

describe("saveDisplayName", () => {
  beforeEach(() => {
    server.user = { id: "u1", user_metadata: { has_password: true } };
  });

  it("goes on to the password step for a student who has no password yet (A6)", async () => {
    server.user = { id: "u1", user_metadata: {} };
    server.select.mockResolvedValue({ data: [{ id: "u1" }], error: null });
    const path = await redirectOf(
      saveDisplayName({}, form({ displayName: "Priya", next: "/sessions/new" })),
    );
    expect(path).toBe("/login/password?next=%2Fsessions%2Fnew");
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

  it("re-renders the layout, so the header shows the new name without a reload", async () => {
    server.select.mockResolvedValue({ data: [{ id: "u1" }], error: null });
    await redirectOf(saveDisplayName({}, form({ displayName: "Priya" })));
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
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
    expect(cache.revalidatePath).not.toHaveBeenCalled();
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
