// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REQUEST_PATH_HEADER } from "@/lib/safe-next";

import { fetchDisplayName, pathAfterSignIn, requireUser, type ServerClient } from "./server";

// requireUser() reads cookies and headers, redirects, and asks Supabase.
// Each is replaced: a fake client whose getUser() and profile read the test
// controls, a redirect() that throws like the real one, and headers carrying
// the path the proxy forwards.
const fake = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: { data: null as { display_name: string | null } | null, error: null as unknown },
  getSession: vi.fn(),
  path: "/sessions/new",
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
  headers: async () => new Headers({ [REQUEST_PATH_HEADER]: fake.path }),
}));

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

function fakeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: fake.user }, error: null }),
      getSession: fake.getSession,
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => fake.profile }),
      }),
    }),
  };
}
vi.mock("@supabase/ssr", () => ({ createServerClient: () => fakeClient() }));

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(Redirect);
  return (error as Redirect).path;
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://placeholder.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "placeholder-anon-key");
  fake.user = null;
  fake.profile = { data: null, error: null };
  fake.path = "/sessions/new";
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("requireUser", () => {
  // React's cache() only memoises inside a render; called directly here, as
  // in a Server Action, every call does the work, so tests stay independent.

  it("returns the signed-in student's id and display name", async () => {
    fake.user = { id: "u1" };
    fake.profile = { data: { display_name: "Priya" }, error: null };
    await expect(requireUser()).resolves.toEqual({ id: "u1", displayName: "Priya" });
    // getUser() revalidates with Supabase; getSession() would trust the cookie.
    expect(fake.getSession).not.toHaveBeenCalled();
  });

  it("sends a signed-out visitor to /login, back to where they were", async () => {
    expect(await redirectOf(requireUser())).toBe("/login?next=%2Fsessions%2Fnew");
  });

  it("drops a forwarded path that is not a safe one", async () => {
    fake.path = "//evil.example";
    expect(await redirectOf(requireUser())).toBe("/login");
  });

  it("sends a student without a display name to the name step", async () => {
    fake.user = { id: "u1" };
    fake.profile = { data: { display_name: null }, error: null };
    expect(await redirectOf(requireUser())).toBe("/login/name?next=%2Fsessions%2Fnew");
  });

  it("treats a missing profile row as no name", async () => {
    fake.user = { id: "u1" };
    fake.profile = { data: null, error: null };
    expect(await redirectOf(requireUser())).toBe("/login/name?next=%2Fsessions%2Fnew");
  });

  it("fails loudly, without Postgres's text, when the profile cannot be read", async () => {
    fake.user = { id: "u1" };
    fake.profile = { data: null, error: { code: "XX000", message: "relation profiles exploded" } };
    await expect(requireUser()).rejects.toThrow("Could not load the signed-in student's profile.");
  });
});

describe("pathAfterSignIn", () => {
  const client = () => fakeClient() as unknown as ServerClient;

  it("goes on to a safe next when the student has a name", async () => {
    fake.profile = { data: { display_name: "Priya" }, error: null };
    expect(await pathAfterSignIn(client(), "u1", "/sessions/new")).toBe("/sessions/new");
    expect(await pathAfterSignIn(client(), "u1", "https://evil.example")).toBe("/sessions");
  });

  it("goes to the name step, carrying next, when they have none", async () => {
    fake.profile = { data: { display_name: null }, error: null };
    expect(await pathAfterSignIn(client(), "u1", "/sessions/new")).toBe(
      "/login/name?next=%2Fsessions%2Fnew",
    );
  });

  it("still lets a signed-in student through if the profile read fails", async () => {
    fake.profile = { data: null, error: { code: "XX000", message: "boom" } };
    expect(await pathAfterSignIn(client(), "u1", "/sessions/new")).toBe("/sessions/new");
  });
});

describe("fetchDisplayName", () => {
  it("treats an empty name as none", async () => {
    fake.profile = { data: { display_name: "" }, error: null };
    expect(await fetchDisplayName(fakeClient() as unknown as ServerClient, "u1")).toBeNull();
  });
});
