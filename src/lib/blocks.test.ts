// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listBlockedUserIds, listMyBlocks } from "./blocks";

// listBlockedUserIds()/listMyBlocks() (US-22) with the database replaced.
// The RLS that makes "nobody can read a row where they're blocked_id" true
// is tested against real Postgres in tests/db/blocks.test.ts.

type Result = { data: unknown; error: { message: string } | null };

function fakeBuilder(result: Result) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "order"]) {
    builder[method] = () => builder;
  }
  return builder;
}

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: db.from }),
}));

function respond(data: unknown, error: { message: string } | null = null) {
  db.from.mockReturnValue(fakeBuilder({ data, error }));
}

beforeEach(() => {
  db.from.mockReset();
});

describe("listBlockedUserIds", () => {
  it("returns the blocked_id of each row", async () => {
    respond([{ blocked_id: "sam" }, { blocked_id: "lee" }]);
    expect(await listBlockedUserIds()).toEqual(["sam", "lee"]);
    expect(db.from).toHaveBeenCalledWith("blocks");
  });

  it("returns an empty list rather than throwing on a database error", async () => {
    respond(null, { message: "boom" });
    expect(await listBlockedUserIds()).toEqual([]);
  });

  it("returns an empty list rather than null", async () => {
    respond(null);
    expect(await listBlockedUserIds()).toEqual([]);
  });
});

describe("listMyBlocks", () => {
  it("maps each row's blocked student and name", async () => {
    respond([
      { blocked_id: "sam", profiles: { display_name: "Sam" } },
      { blocked_id: "lee", profiles: null },
    ]);
    expect(await listMyBlocks()).toEqual([
      { userId: "sam", displayName: "Sam" },
      { userId: "lee", displayName: null },
    ]);
  });

  it("throws on a database error", async () => {
    respond(null, { message: "boom" });
    await expect(listMyBlocks()).rejects.toThrow(/could not load/i);
  });
});
