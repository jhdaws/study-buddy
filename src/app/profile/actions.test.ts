// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveProfile } from "./actions";

// saveProfile() (US-11) with everything outside it replaced: requireUser(),
// the RPC and the table queries. The database's own rules -- own row only,
// only the granted columns, the course limit -- are tested against real
// Postgres in tests/db/academic-profile.test.ts. These check what the action
// sends, in what order, and that no raw database text reaches the student.

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

type Result = { data?: unknown; error: { code?: string; message: string } | null };
type Op = { table: string; method: string; args: unknown[] };

const server = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rpc: vi.fn(),
  ops: [] as { table: string; method: string; args: unknown[] }[],
  replies: {} as Record<string, { data?: unknown; error: { code?: string; message: string } | null }>,
}));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: server.requireUser,
  createClient: async () => ({
    rpc: server.rpc,
    from: (table: string) => {
      let kind = "";
      const builder: Record<string, unknown> = {
        then: (resolve: (value: Result) => unknown) =>
          Promise.resolve(server.replies[`${table}.${kind}`] ?? { data: null, error: null }).then(
            resolve,
          ),
      };
      for (const method of ["select", "update", "insert", "delete", "eq", "in"]) {
        builder[method] = (...args: unknown[]) => {
          if (!kind) kind = method;
          server.ops.push({ table, method, args });
          return builder;
        };
      }
      return builder;
    },
  }),
}));

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ids: Record<string, string> = { "CS 3251": "c-3251", "CS 2201": "c-2201", "MATH 2300": "c-2300" };

function form(values: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const opsOn = (table: string, method: string): Op[] =>
  server.ops.filter((op) => op.table === table && op.method === method);

beforeEach(() => {
  server.ops.length = 0;
  server.requireUser.mockResolvedValue({ id: ME, displayName: "Priya" });
  server.rpc.mockImplementation(
    async (_name: string, args: { p_department_code: string; p_course_number: string }) => ({
      data: ids[`${args.p_department_code} ${args.p_course_number}`] ?? "c-new",
      error: null,
    }),
  );
  server.replies = {
    "profiles.update": { data: [{ id: ME }], error: null },
    "profile_courses.select": { data: [{ course_id: "c-2201" }, { course_id: "c-2300" }], error: null },
    "profile_courses.delete": { error: null },
    "profile_courses.insert": { error: null },
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  server.requireUser.mockReset();
  server.rpc.mockReset();
  cache.revalidatePath.mockReset();
});

describe("saveProfile: success", () => {
  it("updates the caller's own row with the three profile fields, trimmed", async () => {
    const state = await saveProfile(
      {},
      form({ major: " Computer Science ", minor: "", classYear: "junior", courses: [] }),
    );

    expect(state).toMatchObject({ saved: true, courses: [] });
    expect(opsOn("profiles", "update")[0].args).toEqual([
      { major: "Computer Science", minor: null, class_year: "junior" },
    ]);
    expect(opsOn("profiles", "eq")[0].args).toEqual(["id", ME]);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("never writes a column the form could name: no id, display_name or created_at", async () => {
    await saveProfile(
      {},
      form({ major: "Math", id: "someone-else", display_name: "Hijack", created_at: "2001-01-01" }),
    );
    const [patch] = opsOn("profiles", "update")[0].args as [Record<string, unknown>];
    expect(Object.keys(patch).sort()).toEqual(["class_year", "major", "minor"]);
    expect(opsOn("profiles", "eq")[0].args).toEqual(["id", ME]);
  });

  it("creates courses on use, then deletes the dropped ones and inserts the new ones", async () => {
    // Saved before: CS 2201 and MATH 2300. Now: CS 3251 and CS 2201.
    const state = await saveProfile({}, form({ courses: ["cs 3251", "CS 2201"] }));

    expect(server.rpc.mock.calls).toEqual([
      ["get_or_create_course", { p_department_code: "CS", p_course_number: "3251" }],
      ["get_or_create_course", { p_department_code: "CS", p_course_number: "2201" }],
    ]);
    expect(opsOn("profile_courses", "in")[0].args).toEqual(["course_id", ["c-2300"]]);
    expect(opsOn("profile_courses", "insert")[0].args).toEqual([
      [{ user_id: ME, course_id: "c-3251" }],
    ]);
    // Every read and delete is limited to the caller's own rows.
    for (const op of opsOn("profile_courses", "eq")) expect(op.args).toEqual(["user_id", ME]);
    expect(state.courses).toEqual(["CS 3251", "CS 2201"]);
  });

  it("saves a course still typed in the add row", async () => {
    server.replies["profile_courses.select"] = { data: [], error: null };
    const state = await saveProfile(
      {},
      form({ courses: ["CS 2201"], courseDepartment: "MATH", courseNumber: " 2300 " }),
    );
    expect(state.courses).toEqual(["CS 2201", "MATH 2300"]);
    expect(opsOn("profile_courses", "insert")[0].args).toEqual([
      [
        { user_id: ME, course_id: "c-2201" },
        { user_id: ME, course_id: "c-2300" },
      ],
    ]);
  });

  it("writes nothing to profile_courses when the list did not change", async () => {
    await saveProfile({}, form({ courses: ["CS 2201", "MATH 2300"] }));
    expect(opsOn("profile_courses", "delete")).toEqual([]);
    expect(opsOn("profile_courses", "insert")).toEqual([]);
  });

  it("clears every course when none is listed", async () => {
    await saveProfile({}, form({}));
    expect(opsOn("profile_courses", "in")[0].args).toEqual(["course_id", ["c-2201", "c-2300"]]);
    expect(opsOn("profile_courses", "insert")).toEqual([]);
  });
});

describe("saveProfile: refusals", () => {
  it("checks the caller before anything else", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login?next=%2Fprofile"));
    await expect(saveProfile({}, form({ major: "Math" }))).rejects.toBeInstanceOf(Redirect);
    expect(server.ops).toEqual([]);
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("returns field errors without touching the database", async () => {
    const state = await saveProfile({}, form({ major: "x".repeat(81), courses: ["CS 32"] }));
    expect(state.fieldErrors?.major?.[0]).toContain("80");
    expect(state.fieldErrors?.courses?.[0]).toContain("isn't a course number");
    expect(state.values?.major).toBe("x".repeat(81));
    expect(server.ops).toEqual([]);
  });

  it("maps a database refusal to our own words", async () => {
    server.replies["profiles.update"] = {
      error: {
        code: "23514",
        message: 'new row for relation "profiles" violates check constraint "profiles_major_check"',
      },
    };
    const state = await saveProfile({}, form({ major: "Math" }));
    expect(state.formError).toMatch(/major/);
    expect(state.formError).not.toMatch(/violates|relation/);
    expect(state.saved).toBeUndefined();
  });

  it("says so when the profile row is missing", async () => {
    server.replies["profiles.update"] = { data: [], error: null };
    const state = await saveProfile({}, form({ major: "Math" }));
    expect(state.formError).toMatch(/couldn't find your profile/);
  });

  it.each([
    ["creating a course", "rpc"],
    ["reading the saved courses", "profile_courses.select"],
    ["removing a course", "profile_courses.delete"],
    ["adding a course", "profile_courses.insert"],
  ])("stops with a message when %s fails", async (_label, step) => {
    const refusal = { code: "P0001", message: "profile_courses_limit" };
    if (step === "rpc") server.rpc.mockResolvedValue({ data: null, error: refusal });
    else server.replies[step] = { error: refusal };

    const state = await saveProfile({}, form({ courses: ["CS 3251"] }));
    expect(state.formError).toBe("List up to 8 current courses.");
    expect(state.saved).toBeUndefined();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
