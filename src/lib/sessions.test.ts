// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { COURSE_SUGGESTION_LIMIT, listDepartments, listSessions, searchCourses } from "./sessions";

// S4's three reads (#21) with the database replaced. The policies themselves
// are tested against real Postgres in tests/db/session-rules.test.ts ("lets any
// signed-in user read a session and its roster", "hides sessions from a
// connection with no signed-in user"); these tests cover what is in
// TypeScript: the filters asked for, the ranking, the derived fields, and the
// fact that untrusted input cannot reach PostgREST's filter syntax.
//
// Several assertions below check the *request* rather than the result. That
// is deliberate: the two filters this feature can silently get wrong -- the
// ambiguous `profiles` embed and the database-clock comparison -- both look
// fine in a result built by a mock. See the comments on each.

type Result = { data: unknown; error: { message: string } | null };

/** The calls one query made, in order, so a test can assert on them. */
type Recorded = { method: string; args: unknown[] }[];

/**
 * A stand-in for the PostgREST query builder: every filter returns itself, and
 * awaiting it resolves to `result`. supabase-js builders are thenable rather
 * than promises, which is what `then` here imitates.
 */
function fakeBuilder(result: Result, calls: Recorded) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };

  for (const method of ["select", "eq", "gt", "is", "or", "order", "limit"]) {
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

let calls: Recorded;

/** Makes the next query return `data`, and records what it was asked for. */
function respond(data: unknown, error: { message: string } | null = null) {
  calls = [];
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    return fakeBuilder({ data, error }, calls);
  });
}

/** The arguments of the first call to `method`, or undefined if never called. */
const callTo = (method: string) => calls.find((call) => call.method === method)?.args;

const sessionRow = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  topic: "Dynamic programming",
  location_label: "Central Library",
  room: "418",
  starts_at: "2026-10-01T19:30:00+00:00",
  ends_at: "2026-10-01T21:00:00+00:00",
  capacity: 6,
  courses: { department_code: "CS", number: "3251", title: "Intermediate Software Design" },
  profiles: { display_name: "Priya" },
  session_attendees: [{ count: 3 }],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
});

describe("listSessions", () => {
  it("maps a row onto the card the UI reads", async () => {
    respond([sessionRow()]);

    expect(await listSessions()).toEqual([
      {
        id: "11111111-1111-4111-8111-111111111111",
        course: {
          departmentCode: "CS",
          number: "3251",
          title: "Intermediate Software Design",
        },
        topic: "Dynamic programming",
        locationLabel: "Central Library",
        room: "418",
        startsAt: "2026-10-01T19:30:00+00:00",
        endsAt: "2026-10-01T21:00:00+00:00",
        capacity: 6,
        attendeeCount: 3,
        seatsLeft: 3,
        hostDisplayName: "Priya",
      },
    ]);
  });

  it("asks only for open sessions", async () => {
    respond([]);
    await listSessions();

    expect(callTo("eq")).toEqual(["status", "open"]);
  });

  it("compares the end time against the database's clock, not this process's", async () => {
    respond([]);
    await listSessions();

    // `now` is a Postgres special literal, so the comparison is made by the
    // database. An ISO string here instead would read fine and still be
    // wrong: a skewed server clock would hide sessions that have not ended,
    // or keep showing ones that have.
    expect(callTo("gt")).toEqual(["ends_at", "now"]);
  });

  it("names the host_id foreign key, because a plain profiles embed is ambiguous", async () => {
    respond([]);
    await listSessions();

    // PostgREST can reach profiles from sessions two ways -- host_id, and a
    // many-to-many hop through session_attendees -- and fails with PGRST201
    // unless one is named. A mock cannot reproduce that, so this is the only
    // thing standing between a refactor and a 500 on the home page.
    const select = String(callTo("select")?.[0]);
    expect(select).toContain("profiles!sessions_host_id_fkey");
  });

  it("orders soonest first", async () => {
    respond([]);
    await listSessions();

    expect(callTo("order")).toEqual(["starts_at", { ascending: true }]);
  });

  it("counts the roster in the database rather than fetching it", async () => {
    respond([]);
    await listSessions();

    // ADR 0008 rule 9: never a stored counter. It must also not be a fetched
    // array measured here -- that is a row per attendee, per session, per
    // page load.
    expect(String(callTo("select")?.[0])).toContain("session_attendees (count)");
  });

  it("derives seats left from the roster", async () => {
    respond([sessionRow({ capacity: 4, session_attendees: [{ count: 1 }] })]);

    const [session] = await listSessions();
    expect(session.attendeeCount).toBe(1);
    expect(session.seatsLeft).toBe(3);
  });

  it("reports a full session as no seats left, never a negative number", async () => {
    // Over capacity should be impossible, but a negative would reach the UI as
    // "-1 seats left" rather than "Full".
    respond([sessionRow({ capacity: 2, session_attendees: [{ count: 5 }] })]);

    expect((await listSessions())[0].seatsLeft).toBe(0);
  });

  it("treats a missing count as an empty roster", async () => {
    respond([sessionRow({ session_attendees: [] })]);

    expect((await listSessions())[0].attendeeCount).toBe(0);
  });

  it("maps a deleted host to null, so the card can say \"Deleted user\"", async () => {
    respond([sessionRow({ profiles: null })]);

    expect((await listSessions())[0].hostDisplayName).toBeNull();
  });

  it("keeps a blank room as null", async () => {
    respond([sessionRow({ room: null })]);

    expect((await listSessions())[0].room).toBeNull();
  });

  it("returns an empty list, not a crash, when there is nothing to show", async () => {
    respond(null);

    expect(await listSessions()).toEqual([]);
  });

  it("throws with the database's reason when the read fails", async () => {
    respond(null, { message: "connection terminated" });

    await expect(listSessions()).rejects.toThrow(/connection terminated/);
  });
});

describe("listDepartments", () => {
  it("returns the rows as the picker reads them", async () => {
    respond([
      { code: "CS", name: "Computer Science" },
      { code: "ECON", name: null },
    ]);

    expect(await listDepartments()).toEqual([
      { code: "CS", name: "Computer Science" },
      { code: "ECON", name: null },
    ]);
  });

  it("leaves out merged departments and orders by code", async () => {
    respond([]);
    await listDepartments();

    // A merged department still exists because courses reference it; offering
    // it would let the duplicate keep growing (ADR 0008 rule 8).
    expect(callTo("is")).toEqual(["merged_into", null]);
    expect(callTo("order")).toEqual(["code", { ascending: true }]);
  });

  it("throws with the database's reason when the read fails", async () => {
    respond(null, { message: "permission denied" });

    await expect(listDepartments()).rejects.toThrow(/permission denied/);
  });
});

describe("searchCourses", () => {
  const courseRow = (number: string, sessions: number, title: string | null = null) => ({
    id: `id-${number}`,
    department_code: "CS",
    number,
    title,
    sessions: [{ count: sessions }],
  });

  it("normalises the department, so `cs` finds `CS`", async () => {
    respond([]);
    await searchCourses(" cs ", "");

    expect(callTo("eq")).toEqual(["department_code", "CS"]);
  });

  it("returns nothing for a department that normalises away, without asking the database", async () => {
    // The host may be midway through typing a department that does not exist
    // yet -- an empty list, never an error.
    respond([]);

    expect(await searchCourses("...", "3251")).toEqual([]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("leaves out merged courses", async () => {
    respond([]);
    await searchCourses("CS", "");

    expect(callTo("is")).toEqual(["merged_into", null]);
  });

  it("matches a course number by prefix and a title by substring", async () => {
    respond([]);
    await searchCourses("CS", "32");

    expect(String(callTo("or")?.[0])).toBe("number.ilike.32%,title.ilike.%32%");
  });

  it("normalises the number, so `3251w` finds `3251W`", async () => {
    respond([]);
    await searchCourses("CS", "3251w");

    expect(String(callTo("or")?.[0])).toContain("number.ilike.3251W%");
  });

  it("asks for every course in the department when the query is empty", async () => {
    respond([]);
    await searchCourses("CS", "   ");

    // "Most used in this department", for showing suggestions as soon as the
    // field is focused -- not a wildcard filter, which would behave
    // differently for a course with no title.
    expect(callTo("or")).toBeUndefined();
  });

  it("ranks by how many sessions used each course, then by number", async () => {
    respond([courseRow("1101", 1), courseRow("3251", 9), courseRow("1010", 1)]);

    expect((await searchCourses("CS", "")).map((course) => course.number)).toEqual([
      "3251",
      "1010",
      "1101",
    ]);
  });

  it("returns at most COURSE_SUGGESTION_LIMIT suggestions", async () => {
    respond(Array.from({ length: 20 }, (_, i) => courseRow(`${1000 + i}`, i)));

    expect(await searchCourses("CS", "")).toHaveLength(COURSE_SUGGESTION_LIMIT);
  });

  it("treats a course no session has used as zero, not missing", async () => {
    respond([{ ...courseRow("3251", 0), sessions: [] }]);

    expect((await searchCourses("CS", ""))[0].sessionCount).toBe(0);
  });

  it("carries the course through as the typeahead reads it", async () => {
    respond([courseRow("3251", 4, "Intermediate Software Design")]);

    expect(await searchCourses("CS", "")).toEqual([
      {
        id: "id-3251",
        departmentCode: "CS",
        number: "3251",
        title: "Intermediate Software Design",
        sessionCount: 4,
      },
    ]);
  });

  it("throws with the database's reason when the search fails", async () => {
    respond(null, { message: "statement timeout" });

    await expect(searchCourses("CS", "")).rejects.toThrow(/statement timeout/);
  });

  describe("cannot be used to inject PostgREST filter syntax", () => {
    // `or=(...)` is a string parsed as filter structure, and this query comes
    // from a public GET endpoint. A comma or bracket reaching it unescaped
    // would let a caller rewrite the filter; a `%` would quietly match every
    // course in the department.
    // The whole filter, pinned to an exact shape: two needles of nothing but
    // letters, digits and spaces, and exactly the three `%` the query itself
    // adds. Asserting the shape rather than listing forbidden characters is
    // what catches `%` -- a test that strips `%` before looking can never
    // fail on the one wildcard that matches every row.
    const SAFE_FILTER = /^number\.ilike\.[\p{L}\p{N} ]*%,title\.ilike\.%[\p{L}\p{N} ]*%$/u;

    for (const [name, input] of [
      ["a comma", "32,title.ilike.*"],
      ["brackets", "32),or(id.not.is.null"],
      ["an underscore wildcard", "3_5"],
      ["quotes and backslashes", 'a"b\\c'],
      ["a nested or()", "x),and(id.eq.1"],
    ] as const) {
      it(`strips ${name}`, async () => {
        respond([]);
        await searchCourses("CS", input);

        expect(String(callTo("or")?.[0])).toMatch(SAFE_FILTER);
      });
    }

    it("sends no filter at all when nothing searchable survives, rather than a bare wildcard", async () => {
      respond([]);
      await searchCourses("CS", "%%%");

      // `%` alone sanitises to nothing. Falling through to "no filter" shows
      // the department's courses, which is the same as an empty query. The
      // failure to avoid is `title.ilike.%%%%`, a filter that matches
      // everything *and* reads as though it were restricting something.
      expect(callTo("or")).toBeUndefined();
    });

    it("does not let a long paste through either", async () => {
      respond([]);
      await searchCourses("CS", "a".repeat(500));

      expect(String(callTo("or")?.[0]).length).toBeLessThan(200);
    });
  });
});
