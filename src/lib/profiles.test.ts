// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProfile } from "./profiles";

// getProfile() (US-11) with the database replaced. The policies it relies on
// are tested against real Postgres in tests/db/academic-profile.test.ts.

type Result = { data: unknown; error: { message: string } | null };
const calls: { method: string; args: unknown[] }[] = [];

function fakeBuilder(result: Result) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "eq", "maybeSingle"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder;
}

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: db.from }),
}));

function respond(data: unknown, error: { message: string } | null = null) {
  calls.length = 0;
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    return fakeBuilder({ data, error });
  });
}

const callTo = (method: string) => calls.find((call) => call.method === method)?.args;

beforeEach(() => {
  db.from.mockReset();
});

describe("getProfile", () => {
  it("maps the row, with the courses ordered by department then number", async () => {
    respond({
      display_name: "Priya",
      major: "Computer Science",
      minor: null,
      class_year: "junior",
      profile_courses: [
        { courses: { department_code: "MATH", number: "2300", title: null } },
        { courses: { department_code: "CS", number: "3251", title: "Intermediate Software Design" } },
        { courses: { department_code: "CS", number: "2201", title: null } },
      ],
    });

    expect(await getProfile("u1")).toEqual({
      displayName: "Priya",
      major: "Computer Science",
      minor: null,
      classYear: "junior",
      courses: [
        { departmentCode: "CS", number: "2201", title: null },
        { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
        { departmentCode: "MATH", number: "2300", title: null },
      ],
    });
    expect(callTo("from")).toEqual(["profiles"]);
    expect(callTo("eq")).toEqual(["id", "u1"]);
  });

  it("reaches courses through the join table, and never selects an email (US-25)", async () => {
    respond(null);
    await getProfile("u1");

    const select = String(callTo("select")?.[0]);
    // A bare `courses (...)` embed from profiles is ambiguous (PGRST201).
    expect(select).toContain("profile_courses (courses (");
    expect(select).not.toContain("email");
  });

  it("returns null when there is no such profile", async () => {
    respond(null);
    expect(await getProfile("nobody")).toBeNull();
  });

  it("throws with the database's reason when the read fails", async () => {
    respond(null, { message: "permission denied for table profiles" });
    await expect(getProfile("u1")).rejects.toThrow(
      "Could not load the profile: permission denied for table profiles",
    );
  });
});
