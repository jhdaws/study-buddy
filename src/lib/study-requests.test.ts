// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listStudyRequests } from "./study-requests";

// R1's one read (US-16) with the database replaced. The POLICIES are tested
// against real Postgres in tests/db/study-requests.test.ts; what is left for
// here is the part written in TypeScript: the filters the query asks for, and
// the grouping that turns rows into "3 students want CS 3251".
//
// As in sessions.test.ts, some assertions check the REQUEST rather than the
// result. The expiry filter is the reason: a mock can return whatever rows it
// likes, so the only way to see that lapsed requests are excluded by the
// DATABASE's clock is to look at what was asked for.

type Result = { data: unknown; error: { message: string } | null };
type Recorded = { method: string; args: unknown[] }[];

function fakeBuilder(result: Result, calls: Recorded) {
  const builder: Record<string, unknown> = {
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of ["select", "eq", "gt", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return builder;
}

const db = vi.hoisted(() => ({ from: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: db.from }),
  getCurrentUser: async () => db.user(),
}));

const VIEWER = "22222222-2222-4222-8222-222222222222";
const CLASSMATE = "33333333-3333-4333-8333-333333333333";

let calls: Recorded;

function respond(data: unknown, error: { message: string } | null = null) {
  calls = [];
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    return fakeBuilder({ data, error }, calls);
  });
}

const callTo = (method: string) => calls.find((call) => call.method === method)?.args;

const requestRow = (overrides: Record<string, unknown> = {}) => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  course_id: "course-cs-3251",
  author_id: CLASSMATE,
  note: null,
  courses: { department_code: "CS", number: "3251", title: "Intermediate Software Design" },
  ...overrides,
});

beforeEach(() => {
  db.user.mockReset();
  db.user.mockResolvedValue({ id: VIEWER });
  respond([]);
});

describe("listStudyRequests", () => {
  it("asks the database to drop lapsed requests by its own clock", async () => {
    respond([]);
    await listStudyRequests();

    // `now` as a Postgres literal, not an ISO string from this process: a
    // skewed server clock must not decide what has expired. Nothing deletes
    // expired rows, so this filter IS the seven days.
    expect(callTo("gt")).toEqual(["expires_at", "now"]);
  });

  it("reads the course through an inner join", async () => {
    respond([]);
    await listStudyRequests();

    const select = String(callTo("select")?.[0] ?? "");
    // !inner because course_id is NOT NULL: an empty embed can only mean a
    // broken read policy, and a request with no course name is worse than no
    // request at all.
    expect(select).toContain("courses!inner");
    expect(callTo("from")).toEqual(["study_requests"]);
  });

  it("counts people, not rows, per course", async () => {
    respond([
      requestRow({ id: "r1", author_id: CLASSMATE }),
      requestRow({ id: "r2", author_id: VIEWER }),
      requestRow({ id: "r3", author_id: "someone-else" }),
    ]);

    const groups = await listStudyRequests();

    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].course).toEqual({
      departmentCode: "CS",
      number: "3251",
      title: "Intermediate Software Design",
    });
  });

  it("marks the viewer's own request so the UI can offer Withdraw", async () => {
    respond([
      requestRow({ id: "theirs", author_id: CLASSMATE }),
      requestRow({ id: "mine", author_id: VIEWER }),
    ]);

    const [group] = await listStudyRequests();

    expect(group.viewerAsked).toBe(true);
    // The id withdrawRequest() is bound to -- it must be the VIEWER's row,
    // never whichever row happened to come back first.
    expect(group.viewerRequestId).toBe("mine");
  });

  it("does not claim a classmate's request as the viewer's", async () => {
    respond([requestRow({ id: "theirs", author_id: CLASSMATE })]);

    const [group] = await listStudyRequests();

    expect(group.viewerAsked).toBe(false);
    expect(group.viewerRequestId).toBeNull();
  });

  it("marks nothing when nobody is signed in", async () => {
    db.user.mockResolvedValue(null);
    respond([requestRow({ author_id: CLASSMATE })]);

    const [group] = await listStudyRequests();

    expect(group.viewerAsked).toBe(false);
    expect(group.viewerRequestId).toBeNull();
  });

  it("keeps the notes students left and drops the empty ones", async () => {
    respond([
      requestRow({ id: "r1", note: "Tue evening" }),
      requestRow({ id: "r2", note: null }),
      requestRow({ id: "r3", note: "Before the midterm" }),
    ]);

    const [group] = await listStudyRequests();

    expect(group.notes).toEqual(["Tue evening", "Before the midterm"]);
    // Every asker still counts, note or not.
    expect(group.count).toBe(3);
  });

  it("asks for the newest first, so the notes read newest first", async () => {
    respond([]);
    await listStudyRequests();

    expect(callTo("order")).toEqual(["created_at", { ascending: false }]);
  });

  it("puts the most-wanted course first", async () => {
    respond([
      requestRow({
        id: "r1",
        course_id: "course-math-2410",
        courses: { department_code: "MATH", number: "2410", title: null },
      }),
      requestRow({ id: "r2", course_id: "course-cs-3251" }),
      requestRow({ id: "r3", course_id: "course-cs-3251", author_id: "other" }),
    ]);

    const groups = await listStudyRequests();

    // Two students want CS 3251, one wants MATH 2410: a would-be host should
    // see the bigger audience first.
    expect(groups.map((group) => group.course.number)).toEqual(["3251", "2410"]);
    expect(groups.map((group) => group.count)).toEqual([2, 1]);
  });

  it("breaks ties by course so the order is stable between requests", async () => {
    respond([
      requestRow({
        id: "r1",
        course_id: "c-math",
        courses: { department_code: "MATH", number: "2410", title: null },
      }),
      requestRow({
        id: "r2",
        course_id: "c-cs-4278",
        courses: { department_code: "CS", number: "4278", title: null },
      }),
      requestRow({
        id: "r3",
        course_id: "c-cs-3251",
        courses: { department_code: "CS", number: "3251", title: null },
      }),
    ]);

    const groups = await listStudyRequests();

    expect(groups.map((group) => `${group.course.departmentCode} ${group.course.number}`)).toEqual([
      "CS 3251",
      "CS 4278",
      "MATH 2410",
    ]);
  });

  it("returns nothing when there are no open requests", async () => {
    respond([]);
    await expect(listStudyRequests()).resolves.toEqual([]);
  });

  it("throws our own message, never PostgREST's", async () => {
    respond(null, { message: 'relation "study_requests" does not exist' });

    // The page's error boundary shows a retry screen; the student never sees
    // a schema name.
    await expect(listStudyRequests()).rejects.toThrow("Could not load the study requests");
  });
});
