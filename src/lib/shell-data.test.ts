import { describe, expect, it, vi } from "vitest";

import type { MySession } from "@/lib/sessions";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email?: string },
  name: "Moses Banda" as string | null,
  mine: [] as unknown[],
  failMine: false,
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mocks.user } }) } }),
  fetchDisplayName: async () => mocks.name,
}));
vi.mock("@/lib/sessions", () => ({
  listMySessions: async () => {
    if (mocks.failMine) throw new Error("down");
    return mocks.mine;
  },
}));

import { coursesFrom, getShellData } from "./shell-data";

const s = (code: string, number: string, startsAt: string) =>
  ({ course: { departmentCode: code, number, title: null }, startsAt }) as unknown as MySession;

describe("coursesFrom", () => {
  it("lists each course once, most recent session first", () => {
    const list = [s("CS", "3251", "2026-10-01"), s("MATH", "2410", "2026-10-02"), s("CS", "3251", "2026-10-03")];
    expect(coursesFrom(list)).toEqual([
      { code: "CS 3251", departmentCode: "CS" },
      { code: "MATH 2410", departmentCode: "MATH" },
    ]);
  });
});

describe("getShellData", () => {
  it("is signed out without a user", async () => {
    mocks.user = null;
    expect(await getShellData()).toEqual({ signedIn: false });
  });

  it("counts upcoming hosted and joined sessions, and lists courses", async () => {
    mocks.user = { id: "me", email: "moses.banda@vanderbilt.edu" };
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    mocks.mine = [
      { ...s("CS", "3251", future), status: "open", endsAt: future, hostId: "me" },
      { ...s("MATH", "2410", future), status: "open", endsAt: future, hostId: "other" },
      { ...s("ECON", "1010", past), status: "open", endsAt: past, hostId: "other" },
      { ...s("PSY", "1200", future), status: "cancelled", endsAt: future, hostId: "other" },
    ];
    const shell = await getShellData();
    expect(shell).toMatchObject({ signedIn: true, displayName: "Moses Banda", email: "moses.banda@vanderbilt.edu", hosting: 1, joined: 1 });
    expect(shell.signedIn && shell.courses.map((c) => c.code)).toEqual(["PSY 1200", "ECON 1010", "MATH 2410", "CS 3251"]);
  });

  it("shows an empty sidebar rather than failing when sessions cannot load", async () => {
    mocks.user = { id: "me" };
    mocks.failMine = true;
    expect(await getShellData()).toMatchObject({ signedIn: true, email: null, hosting: 0, joined: 0, courses: [] });
    mocks.failMine = false;
  });
});
