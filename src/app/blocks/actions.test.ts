// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { blockUser, unblockUser } from "./actions";

// blockUser()/unblockUser() (US-22) with requireUser() and the database
// replaced. The database's own rules -- RLS refuses a row where you are not
// the blocker, the self-block CHECK, cascade on delete -- are tested against
// real Postgres in tests/db/blocks.test.ts.

class Redirect extends Error {
  constructor(readonly path: string) {
    super(`redirect to ${path}`);
  }
}

const fakes = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: fakes.requireUser,
  createClient: async () => ({ from: fakes.from }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  fakes.requireUser.mockResolvedValue({ id: ME, displayName: "Priya" });
  fakes.insert.mockResolvedValue({ error: null });
  // Delete chains two .eq() calls; the second must resolve the promise.
  fakes.eq.mockReturnValue({ eq: fakes.eq });
  fakes.delete.mockReturnValue({ eq: fakes.eq });
  fakes.from.mockReturnValue({ insert: fakes.insert, delete: fakes.delete });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const fake of Object.values(fakes)) fake.mockReset();
});

describe("blockUser", () => {
  it("inserts the block", async () => {
    const state = await blockUser(SAM, {}, new FormData());

    expect(state).toEqual({});
    expect(fakes.from).toHaveBeenCalledWith("blocks");
    expect(fakes.insert).toHaveBeenCalledWith({ blocked_id: SAM });
  });

  it("refuses blocking yourself before the database does", async () => {
    const state = await blockUser(ME, {}, new FormData());
    expect(state.error).toBe("You can't block yourself.");
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("checks the caller first", async () => {
    fakes.requireUser.mockRejectedValue(new Redirect("/login"));
    await expect(blockUser(SAM, {}, new FormData())).rejects.toBeInstanceOf(Redirect);
    expect(fakes.from).not.toHaveBeenCalled();
  });

  it("never shows raw database text", async () => {
    fakes.insert.mockResolvedValue({
      error: { code: "42501", message: 'new row violates row-level security policy for table "blocks"' },
    });
    const state = await blockUser(SAM, {}, new FormData());
    expect(state.error).toBe("You don't have permission to do that.");
  });
});

describe("unblockUser", () => {
  beforeEach(() => {
    // The second .eq() is what the action actually awaits.
    fakes.eq.mockImplementation(() => ({ eq: fakes.eq, then: (resolve: (v: unknown) => void) => resolve({ error: null }) }));
  });

  it("deletes the caller's own block on the given student", async () => {
    const state = await unblockUser(SAM, {}, new FormData());

    expect(state).toEqual({});
    expect(fakes.from).toHaveBeenCalledWith("blocks");
    expect(fakes.delete).toHaveBeenCalled();
    expect(fakes.eq).toHaveBeenCalledWith("blocker_id", ME);
    expect(fakes.eq).toHaveBeenCalledWith("blocked_id", SAM);
  });

  it("checks the caller first", async () => {
    fakes.requireUser.mockRejectedValue(new Redirect("/login"));
    await expect(unblockUser(SAM, {}, new FormData())).rejects.toBeInstanceOf(Redirect);
    expect(fakes.from).not.toHaveBeenCalled();
  });

  it("never shows raw database text", async () => {
    fakes.eq.mockImplementation(() => ({
      eq: fakes.eq,
      then: (resolve: (v: unknown) => void) =>
        resolve({ error: { code: "42501", message: "permission denied" } }),
    }));
    const state = await unblockUser(SAM, {}, new FormData());
    expect(state.error).toBe("You don't have permission to do that.");
  });
});
