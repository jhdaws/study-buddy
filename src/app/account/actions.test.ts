// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE_ACCOUNT_FAILED_MESSAGE } from "@/lib/errors";

import { deleteAccount } from "./actions";

// deleteAccount() (US-24) with everything outside it replaced: requireUser(),
// the admin client, the cookie-bound client and redirect(). What a deletion
// does to the data is tested against real Postgres in
// tests/db/delete-account.test.ts. These check WHOSE account is deleted --
// only ever the caller's -- and what a student sees when it fails.

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
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

const fakes = vi.hoisted(() => ({
  requireUser: vi.fn(),
  deleteUser: vi.fn(),
  signOut: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: fakes.requireUser,
  createClient: async () => ({ auth: { signOut: fakes.signOut } }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.createAdminClient }));

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOMEONE_ELSE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function redirectOf(promise: Promise<unknown>): Promise<string> {
  const thrown = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(Redirect);
  return (thrown as Redirect).path;
}

beforeEach(() => {
  fakes.requireUser.mockResolvedValue({ id: ME, displayName: "Priya" });
  fakes.deleteUser.mockResolvedValue({ data: { user: null }, error: null });
  fakes.signOut.mockResolvedValue({ error: null });
  fakes.createAdminClient.mockReturnValue({ auth: { admin: { deleteUser: fakes.deleteUser } } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const fake of Object.values(fakes)) fake.mockReset();
  cache.revalidatePath.mockReset();
});

describe("deleteAccount", () => {
  it("deletes the caller's own account, signs this device out, and goes home with a notice", async () => {
    expect(await redirectOf(deleteAccount({}, form({ confirm: "yes" })))).toBe("/?account=deleted");

    expect(fakes.deleteUser).toHaveBeenCalledTimes(1);
    // A hard delete: no second argument, so shouldSoftDelete stays false.
    expect(fakes.deleteUser).toHaveBeenCalledWith(ME);
    expect(fakes.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("never deletes an account the form names", async () => {
    await redirectOf(
      deleteAccount(
        {},
        form({ confirm: "yes", id: SOMEONE_ELSE, userId: SOMEONE_ELSE, user_id: SOMEONE_ELSE }),
      ),
    );
    expect(fakes.deleteUser.mock.calls).toEqual([[ME]]);
  });

  it("refuses a signed-out caller before touching the admin API", async () => {
    fakes.requireUser.mockRejectedValue(new Redirect("/login?next=%2Faccount%2Fdelete"));

    expect(await redirectOf(deleteAccount({}, form({ confirm: "yes" })))).toBe(
      "/login?next=%2Faccount%2Fdelete",
    );
    expect(fakes.createAdminClient).not.toHaveBeenCalled();
    expect(fakes.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["anything but yes", { confirm: "on" }],
  ])("asks for the confirmation when it is %s, and deletes nothing", async (_label, values) => {
    const state = await deleteAccount({}, form(values));
    expect(state.fieldErrors?.confirm?.[0]).toBe(
      "Tick the box to confirm you want your account deleted.",
    );
    expect(fakes.createAdminClient).not.toHaveBeenCalled();
  });

  it("says nothing was deleted when Supabase refuses, without its text", async () => {
    fakes.deleteUser.mockResolvedValue({
      data: { user: null },
      error: { status: 500, code: "unexpected_failure", message: "Database error deleting user" },
    });

    const state = await deleteAccount({}, form({ confirm: "yes" }));
    expect(state).toEqual({ formError: DELETE_ACCOUNT_FAILED_MESSAGE });
    expect(fakes.signOut).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("treats an account that is already gone as deleted", async () => {
    fakes.deleteUser.mockResolvedValue({
      data: { user: null },
      error: { status: 404, code: "user_not_found", message: "User not found" },
    });
    expect(await redirectOf(deleteAccount({}, form({ confirm: "yes" })))).toBe("/?account=deleted");
  });

  it("fails safe when the secret key is missing from this deployment", async () => {
    fakes.createAdminClient.mockImplementation(() => {
      throw new Error("Missing environment variable SUPABASE_SECRET_KEY.");
    });

    const state = await deleteAccount({}, form({ confirm: "yes" }));
    expect(state).toEqual({ formError: DELETE_ACCOUNT_FAILED_MESSAGE });
    expect(fakes.signOut).not.toHaveBeenCalled();
  });

  it("still goes home if the sign-out after deleting fails", async () => {
    fakes.signOut.mockRejectedValue(new Error("fetch failed"));
    expect(await redirectOf(deleteAccount({}, form({ confirm: "yes" })))).toBe("/?account=deleted");
  });
});
