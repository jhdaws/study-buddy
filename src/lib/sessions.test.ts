// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  COURSE_SUGGESTION_LIMIT,
  getSession,
  listDepartments,
  listMySessions,
  listPastSessions,
  listSessionCourses,
  listSessions,
  PAST_SESSIONS_LIMIT,
  searchCourses,
} from "./sessions";

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

  for (const method of ["select", "eq", "gt", "is", "in", "or", "order", "limit", "maybeSingle"]) {
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
// US-22: listSessions() also reads `blocks` (listBlockedUserIds()), a second
// table the single-response `respond()` below knows nothing about. Defaults
// to "nothing blocked" so every pre-existing test, which never heard of
// blocks, keeps seeing exactly the rows it asks for.
let blockedIds: string[] = [];

/** The ids of the sessions test's viewer's blocked students, for this test only. */
function respondBlocked(ids: string[]) {
  blockedIds = ids;
}

/** Makes the next query return `data`, and records what it was asked for. */
function respond(data: unknown, error: { message: string } | null = null) {
  calls = [];
  blockedIds = [];
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    if (table === "blocks") {
      return fakeBuilder({ data: blockedIds.map((id) => ({ blocked_id: id })), error: null }, calls);
    }
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
  locations: { lat: 36.1452, lng: -86.8006 },
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
        lat: 36.1452,
        lng: -86.8006,
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

  it("embeds each session's stored coordinates for the map (M4)", async () => {
    respond([]);
    await listSessions();

    // The pin goes where resolvePlace() stored Google's coordinates -- the
    // `locations` row -- never anywhere the host typed. `!inner`, like
    // `courses!inner`: location_id is NOT NULL, so an empty embed can only
    // mean a broken policy, and that session is better left out than pinned
    // without coordinates.
    expect(String(callTo("select")?.[0])).toContain("locations!inner (lat, lng)");
  });

  it("puts each session's coordinates on the list item, unrounded", async () => {
    respond([sessionRow({ locations: { lat: 36.144_512_3, lng: -86.802_745_6 } })]);

    const [session] = await listSessions();
    expect([session.lat, session.lng]).toEqual([36.144_512_3, -86.802_745_6]);
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

  // US-06: the course filter is the reason this function takes options. The
  // assertion is on the REQUEST -- a mock can return any rows, so the only
  // way to see that the database was asked for one course is to look at the
  // filters. Ticket: "src/lib/sessions.test.ts asserts the exact query".
  it("asks the database for one course when a course filter is set", async () => {
    respond([]);
    await listSessions({ course: { departmentCode: "CS", number: "3251" } });

    expect(calls.filter((call) => call.method === "eq").map((call) => call.args)).toEqual([
      ["status", "open"],
      ["courses.department_code", "CS"],
      ["courses.number", "3251"],
    ]);
  });

  it("does not add course filters when none were asked for", async () => {
    respond([]);
    await listSessions();

    // Only the status filter -- a stray courses.* eq would silently narrow
    // every unfiltered visit.
    expect(calls.filter((call) => call.method === "eq").map((call) => call.args)).toEqual([
      ["status", "open"],
    ]);
  });

  // US-22: a blocked host's sessions never show, as if they did not exist.
  it("leaves out a session hosted by someone the viewer has blocked", async () => {
    respond([
      sessionRow({ host_id: "blocked-host" }),
      sessionRow({ id: "22222222-2222-4222-8222-222222222222", host_id: "open-host" }),
    ]);
    respondBlocked(["blocked-host"]);

    expect((await listSessions()).map((s) => s.id)).toEqual([
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  // A NOT IN filter in SQL drops a NULL host_id too (NULL IN (...) is
  // neither true nor false) -- the JS filter below must not make the same
  // mistake for a session whose host deleted their account.
  it("keeps a session with no host, even when the viewer has blocks", async () => {
    respond([sessionRow({ host_id: null })]);
    respondBlocked(["someone-else"]);

    expect(await listSessions()).toHaveLength(1);
  });
});

// S6 (#52). Ids are uuids in the 4/8 variant, which is what Postgres hands out.
const HOST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EARLY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LATE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const PLACE_ID = "ChIJ-central-library";

const detailRow = (overrides: Record<string, unknown> = {}) =>
  sessionRow({
    status: "open",
    host_id: HOST,
    // S7 (US-09): the edit form prefills <LocationPicker> from this.
    locations: { place_id: PLACE_ID },
    // Deliberately out of order: the late joiner first, the host in the middle.
    session_attendees: [
      { user_id: LATE, joined_at: "2026-10-01T18:00:00+00:00", profiles: { display_name: "Sam", major: null, class_year: null } },
      { user_id: HOST, joined_at: "2026-10-01T12:00:00+00:00", profiles: { display_name: "Priya", major: "Computer Science", class_year: "junior" } },
      { user_id: EARLY, joined_at: "2026-10-01T13:00:00+00:00", profiles: { display_name: "Alex", major: null, class_year: "first_year" } },
    ],
    ...overrides,
  });

describe("getSession", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("maps a row onto the session page, with its roster", async () => {
    respond(detailRow());

    expect(await getSession(id)).toEqual({
      id,
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
      status: "open",
      hostId: HOST,
      attendees: [
        { userId: HOST, displayName: "Priya", isHost: true, major: "Computer Science", classYear: "junior", isBlocked: false },
        { userId: EARLY, displayName: "Alex", isHost: false, major: null, classYear: "first_year", isBlocked: false },
        { userId: LATE, displayName: "Sam", isHost: false, major: null, classYear: null, isBlocked: false },
      ],
      placeId: PLACE_ID,
    });
  });

  // US-22: marked from the viewer's OWN blocks, never the reverse.
  it("marks an attendee the viewer has blocked", async () => {
    respond(detailRow());
    respondBlocked([EARLY]);

    const session = await getSession(id);
    expect(session?.attendees.map((a) => [a.userId, a.isBlocked])).toEqual([
      [HOST, false],
      [EARLY, true],
      [LATE, false],
    ]);
  });

  it("asks for that one session, by id", async () => {
    respond(detailRow());
    await getSession(id);

    expect(callTo("from")).toEqual(["sessions"]);
    expect(callTo("eq")).toEqual(["id", id]);
    expect(callTo("maybeSingle")).toEqual([]);
  });

  it("does not filter out cancelled or ended sessions", async () => {
    respond(detailRow());
    await getSession(id);

    // The page tells someone holding a link what happened; the list's
    // filters here would turn that into a 404.
    expect(callTo("gt")).toBeUndefined();
    expect(calls.filter((call) => call.method === "eq")).toHaveLength(1);
  });

  it("names the host_id foreign key, and never selects an email", async () => {
    respond(detailRow());
    await getSession(id);

    const select = String(callTo("select")?.[0]);
    expect(select).toContain("profiles!sessions_host_id_fkey");
    expect(select).toContain(
      "session_attendees (user_id, joined_at, profiles (display_name, major, class_year))",
    );
    // S7 (US-09): the place id the edit form prefills from. `!inner` because
    // location_id is NOT NULL -- every session has exactly one location, and
    // the embed should not make the row optional.
    expect(select).toContain("locations!inner (place_id)");
    // US-25: the roster is names only.
    expect(select).not.toContain("email");
  });

  it("returns null when there is no such session", async () => {
    respond(null);

    expect(await getSession(id)).toBeNull();
  });

  it("returns null for an id that is not a uuid, without asking the database", async () => {
    respond(detailRow());

    // Postgres would fail with 22P02 rather than find nothing.
    expect(await getSession("not-a-session")).toBeNull();
    expect(await getSession(`${id}' or 1=1`)).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("derives the seat count from the roster it fetched", async () => {
    respond(detailRow({ capacity: 3 }));

    const session = await getSession(id);
    expect(session?.attendeeCount).toBe(3);
    expect(session?.seatsLeft).toBe(0);
  });

  it("keeps a cancelled session's status, and a deleted host's empty name", async () => {
    respond(
      detailRow({
        status: "cancelled",
        host_id: null,
        profiles: null,
        session_attendees: [
          { user_id: EARLY, joined_at: "2026-10-01T13:00:00+00:00", profiles: { display_name: "Alex" } },
        ],
      }),
    );

    const session = await getSession(id);
    expect(session?.status).toBe("cancelled");
    expect(session?.hostId).toBeNull();
    expect(session?.hostDisplayName).toBeNull();
    // An embed without the profile's newer columns still maps: they are null.
    expect(session?.attendees).toEqual([
      { userId: EARLY, displayName: "Alex", isHost: false, major: null, classYear: null, isBlocked: false },
    ]);
  });

  it("throws with the database's message when the query fails", async () => {
    respond(null, { message: "permission denied for table sessions" });

    await expect(getSession(id)).rejects.toThrow(
      "Could not load the session: permission denied for table sessions",
    );
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

// ---------------------------------------------------------------------------
// Home's readers (H1, #128; US-15, #133): the student's own roster.
// ---------------------------------------------------------------------------

/** Different rows per table: the roster read, then the sessions read. */
function respondByTable(tables: Record<string, unknown>) {
  calls = [];
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    return fakeBuilder({ data: tables[table] ?? [], error: null }, calls);
  });
}

const ME = "22222222-2222-4222-8222-222222222222";

describe("listMySessions", () => {
  it("reads the student's roster rows, then those open, not-ended sessions, soonest first", async () => {
    respondByTable({
      session_attendees: [{ session_id: "s1" }, { session_id: "s2" }],
      sessions: [
        sessionRow({ id: "s1", host_id: ME, status: "open" }),
        sessionRow({ id: "s2", host_id: "someone-else", status: "open" }),
      ],
    });

    const mine = await listMySessions(ME);

    expect(mine.map((s) => [s.id, s.hosting])).toEqual([
      ["s1", true],
      ["s2", false],
    ]);
    expect(calls.find((c) => c.method === "eq" && c.args[0] === "user_id")?.args).toEqual([
      "user_id",
      ME,
    ]);
    expect(callTo("in")).toEqual(["id", ["s1", "s2"]]);
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toContainEqual([
      "status",
      "open",
    ]);
    expect(callTo("gt")).toEqual(["ends_at", "now"]);
    expect(callTo("order")).toEqual(["starts_at", { ascending: true }]);
  });

  it("returns nothing, without a sessions query, when the student is on no roster", async () => {
    respondByTable({ session_attendees: [] });

    expect(await listMySessions(ME)).toEqual([]);
    expect(calls.filter((c) => c.method === "from").map((c) => c.args[0])).toEqual([
      "session_attendees",
    ]);
  });
});

describe("listPastSessions (US-15)", () => {
  it("lists ended or cancelled sessions, most recent first, capped, flagging cancelled ones", async () => {
    respondByTable({
      session_attendees: [{ session_id: "s1" }, { session_id: "s2" }],
      sessions: [
        sessionRow({ id: "s2", host_id: "someone-else", status: "cancelled" }),
        sessionRow({ id: "s1", host_id: ME, status: "open" }),
      ],
    });

    const past = await listPastSessions(ME);

    expect(past.map((s) => [s.id, s.hosting, s.cancelled])).toEqual([
      ["s2", false, true],
      ["s1", true, false],
    ]);
    expect(callTo("or")).toEqual(["status.eq.cancelled,ends_at.lte.now"]);
    expect(callTo("order")).toEqual(["starts_at", { ascending: false }]);
    expect(callTo("limit")).toEqual([PAST_SESSIONS_LIMIT]);
  });

  it("shows a host who deleted their account as null, for the \"Deleted user\" label", async () => {
    respondByTable({
      session_attendees: [{ session_id: "s1" }],
      sessions: [sessionRow({ id: "s1", host_id: null, status: "open", profiles: null })],
    });

    const [session] = await listPastSessions(ME);
    expect(session.hostDisplayName).toBeNull();
    expect(session.hosting).toBe(false);
  });

  it("throws rather than showing an empty history when the roster read fails", async () => {
    calls = [];
    db.from.mockImplementation((table: string) => {
      calls.push({ method: "from", args: [table] });
      return fakeBuilder({ data: null, error: { message: "boom" } }, calls);
    });
    await expect(listPastSessions(ME)).rejects.toThrow("Could not load your sessions");
  });
});

describe("listSessionCourses (US-06 chips)", () => {
  it("returns each course with an open session once, sorted by code", async () => {
    respond([
      { courses: { department_code: "MATH", number: "2300" } },
      { courses: { department_code: "CS", number: "3251" } },
      { courses: { department_code: "CS", number: "3251" } },
      { courses: { department_code: "CS", number: "2201" } },
    ]);

    expect(await listSessionCourses()).toEqual([
      { departmentCode: "CS", number: "2201" },
      { departmentCode: "CS", number: "3251" },
      { departmentCode: "MATH", number: "2300" },
    ]);
  });

  it("applies the same open-and-not-ended filters as listSessions()", async () => {
    respond([]);
    await listSessionCourses();

    expect(callTo("from")).toEqual(["sessions"]);
    expect(calls.filter((call) => call.method === "eq").map((call) => call.args)).toEqual([
      ["status", "open"],
    ]);
    expect(callTo("gt")).toEqual(["ends_at", "now"]);
  });

  it("throws rather than returning an empty list when the read fails", async () => {
    respond(null, { message: "boom" });
    await expect(listSessionCourses()).rejects.toThrow("Could not load the session courses");
  });
});
