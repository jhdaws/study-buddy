// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceError } from "@/lib/places";

import {
  cancelSession,
  createSession,
  editSession,
  joinSession,
  leaveSession,
  requestSession,
  withdrawRequest,
} from "./actions";

// createSession() (S3) with everything outside it replaced: requireUser(),
// resolvePlace(), the two RPCs and redirect(). The database's own rules are
// tested against real Postgres in tests/db/; these tests check the order of
// the steps, what reaches each RPC, and that no raw database text reaches the
// student. W9 (#48), TEST_PLAN.md "Next tests".

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

const server = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: server.requireUser,
  // `from` is only used by the study-request actions at the bottom of this
  // file; the session actions go through RPCs alone.
  createClient: async () => ({ rpc: server.rpc, from: server.from }),
}));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

// Keep the real PlaceError (and its messages); replace only the lookup.
const places = vi.hoisted(() => ({ resolvePlace: vi.fn() }));
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  resolvePlace: places.resolvePlace,
}));

// editSession() reads the session's stored start time (S7, US-09).
const sessions = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/sessions", () => ({ getSession: sessions.getSession }));
// SEC-05's per-student limit: null is "allowed", an error is a refusal.
const rateLimit = vi.hoisted(() => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: rateLimit.consumeRateLimit }));

const HOUR = 60 * 60 * 1000;

/** A submission that passes createSessionSchema, as the form posts it. */
function form(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    departmentCode: "cs",
    courseNumber: "3251",
    topic: "Design patterns review",
    room: "",
    placeId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    locationLabel: "Featheringill Hall",
    startsAt: new Date(Date.now() + HOUR).toISOString(),
    endsAt: new Date(Date.now() + 3 * HOUR).toISOString(),
    capacity: "4",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** The two RPCs' replies, in call order. */
function rpcReplies(course: unknown, session: unknown) {
  server.rpc.mockImplementation(async (name: string) =>
    name === "get_or_create_course" ? course : session,
  );
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
  server.requireUser.mockResolvedValue({ id: "u1", displayName: "Priya" });
  places.resolvePlace.mockResolvedValue({ locationId: "loc-1" });
  rateLimit.consumeRateLimit.mockResolvedValue(null);
  rpcReplies({ data: "course-1", error: null }, { data: { id: "s1" }, error: null });
  // A session whose start is still ahead, so editSessionSchema's allowance
  // for an unmoved past start is not what makes a test pass by accident.
  sessions.getSession.mockResolvedValue({
    id: "s1",
    startsAt: new Date(Date.now() + HOUR).toISOString(),
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  server.requireUser.mockReset();
  server.rpc.mockReset();
  server.from.mockReset();
  places.resolvePlace.mockReset();
  rateLimit.consumeRateLimit.mockReset();
  cache.revalidatePath.mockReset();
  sessions.getSession.mockReset();
});

describe("createSession: success", () => {
  it("resolves the place, creates the course on use, creates the session, then goes to the list", async () => {
    const submitted = form();

    expect(await redirectOf(createSession({}, submitted))).toBe("/sessions");

    expect(places.resolvePlace).toHaveBeenCalledWith("ChIJN1t_tDeuEmsRUsoyG83frY4", {
      sessionToken: undefined, // the fixture picker sends none
    });
    expect(server.rpc).toHaveBeenNthCalledWith(1, "get_or_create_course", {
      p_department_code: "CS",
      p_course_number: "3251",
    });
    expect(server.rpc).toHaveBeenNthCalledWith(2, "create_session", {
      course_id: "course-1",
      location_id: "loc-1",
      location_label: "Featheringill Hall",
      room: "", // blank becomes "": the function turns it back into null
      topic: "Design patterns review",
      starts_at: submitted.get("startsAt"),
      ends_at: submitted.get("endsAt"),
      capacity: 4,
    });
  });

  it("hands the picker's Autocomplete session token to resolvePlace() (M2)", async () => {
    const token = "0b6c8a52-3f0e-4c1d-9d55-6f1d3c0a9e21";
    await redirectOf(createSession({}, form({ placeSessionToken: token })));
    expect(places.resolvePlace).toHaveBeenCalledWith("ChIJN1t_tDeuEmsRUsoyG83frY4", {
      sessionToken: token,
    });
  });

  it("never sends a host id: create_session takes the host from the session cookie", async () => {
    await redirectOf(createSession({}, form()));
    const [, args] = server.rpc.mock.calls[1];
    expect(Object.keys(args)).not.toContain("host_id");
  });
});

describe("createSession: stops early", () => {
  it("lets requireUser()'s redirect through for a signed-out student, before anything else", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login?next=%2Fsessions%2Fnew"));

    expect(await redirectOf(createSession({}, form()))).toBe("/login?next=%2Fsessions%2Fnew");
    expect(places.resolvePlace).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("returns field errors for an invalid form without looking anything up", async () => {
    const state = await createSession({}, form({ topic: "", capacity: "1" }));

    expect(state.fieldErrors?.topic).toBeDefined();
    expect(state.fieldErrors?.capacity).toBeDefined();
    expect(state.values?.capacity).toBe("1");
    expect(places.resolvePlace).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("shows a refused place against the place field, and writes nothing", async () => {
    places.resolvePlace.mockRejectedValue(new PlaceError("outside_campus", "x"));

    const state = await createSession({}, form());

    expect(state.fieldErrors).toEqual({
      placeId: ["That place is too far from campus. Choose somewhere closer."],
    });
    expect(state.values?.topic).toBe("Design patterns review");
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("lets an unexpected error from resolvePlace() through, to the error page", async () => {
    places.resolvePlace.mockRejectedValue(new Error("Missing environment variable"));
    await expect(createSession({}, form())).rejects.toThrow("Missing environment variable");
    expect(server.rpc).not.toHaveBeenCalled();
  });
});

describe("createSession: database refusals", () => {
  it("maps a course refusal to our own message, logs the original, and stops", async () => {
    rpcReplies({ data: null, error: { code: "P0001", message: "invalid_course_number" } }, null);

    const state = await createSession({}, form());

    expect(state.formError).toBe("Enter a 4-digit course number, like 3251 or 2100W.");
    expect(server.rpc).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("createSession: get_or_create_course failed", {
      code: "P0001",
      message: "invalid_course_number",
    });
  });

  it("maps a session refusal to our own message and keeps the form values", async () => {
    rpcReplies(
      { data: "course-1", error: null },
      { data: null, error: { code: "P0001", message: "starts_in_past" } },
    );

    const state = await createSession({}, form());

    expect(state.formError).toBe("That start time has already passed.");
    expect(state.values?.locationLabel).toBe("Featheringill Hall");
  });

  it("never shows Postgres's own text: an unmapped foreign-key failure gets the generic message", async () => {
    rpcReplies(
      { data: "course-1", error: null },
      {
        data: null,
        error: {
          code: "23503",
          message:
            'insert or update on table "sessions" violates foreign key constraint "sessions_location_id_fkey"',
        },
      },
    );

    const state = await createSession({}, form());

    expect(state.formError).toBe("Something went wrong on our side. Try again in a moment.");
    expect(state.formError).not.toMatch(/sessions|constraint|violates/);
    expect(console.error).toHaveBeenCalledWith(
      "createSession: create_session failed",
      expect.objectContaining({ code: "23503" }),
    );
  });
});

// SEC-05 (threat model T8): every resolvePlace() can be a billed Google
// call, so createSession() spends a `place_lookup` hit first. The counting
// itself is consume_rate_limit()'s, tested against real Postgres in
// tests/db/place-lookup-rate-limit.test.ts.
describe("createSession: place lookup rate limit (SEC-05)", () => {
  const LIMITED = { code: "PT429", message: "place_lookup_rate_limited", details: "20 of 20 hits" };

  it("spends one place lookup before resolving the place", async () => {
    await redirectOf(createSession({}, form()));

    expect(rateLimit.consumeRateLimit).toHaveBeenCalledOnce();
    expect(rateLimit.consumeRateLimit).toHaveBeenCalledWith("place_lookup");
    expect(rateLimit.consumeRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      places.resolvePlace.mock.invocationCallOrder[0],
    );
  });

  it("at the limit: never calls resolvePlace() or either RPC, and says why against the form", async () => {
    rateLimit.consumeRateLimit.mockResolvedValue(LIMITED);

    const state = await createSession({}, form());

    expect(places.resolvePlace).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
    expect(state.formError).toBe(
      "You've tried a lot of places in the last few minutes. Wait a few minutes, then try again.",
    );
    expect(state.fieldErrors).toBeUndefined();
    expect(state.values?.topic).toBe("Design patterns review");
  });

  it("logs the refusal by code and name only -- not the place, not the student", async () => {
    rateLimit.consumeRateLimit.mockResolvedValue(LIMITED);

    await createSession({}, form());

    expect(console.error).toHaveBeenCalledWith("createSession: consume_rate_limit failed", {
      code: "PT429",
      message: "place_lookup_rate_limited",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/ChIJ|u1|Priya/);
  });

  it("fails closed: if the check itself fails, nothing is looked up", async () => {
    rateLimit.consumeRateLimit.mockResolvedValue({ message: "fetch failed" });

    const state = await createSession({}, form());

    expect(places.resolvePlace).not.toHaveBeenCalled();
    expect(state.formError).toBe("Something went wrong on our side. Try again in a moment.");
  });

  it("spends nothing on a form that fails validation, or for a signed-out student", async () => {
    await createSession({}, form({ topic: "" }));

    server.requireUser.mockRejectedValue(new Redirect("/login"));
    await redirectOf(createSession({}, form()));

    expect(rateLimit.consumeRateLimit).not.toHaveBeenCalled();
  });
});

// joinSession() and leaveSession() (S5) with everything outside them
// replaced the same way: requireUser() and the RPC. The row lock and every
// refusal reason (full, cancelled, ended, already on the roster, ...) are
// join_session's and leave_session's own rules, tested against real
// Postgres in tests/db/join-leave-session.test.ts -- these tests check that
// the action calls the right RPC, revalidates the right paths, and never
// shows raw database text.

describe("joinSession: success", () => {
  it("calls join_session with the session id and revalidates the session and the list", async () => {
    server.rpc.mockResolvedValue({ data: { session_id: "s1", user_id: "u1" }, error: null });

    const state = await joinSession("s1", {}, new FormData());

    expect(state).toEqual({});
    expect(server.rpc).toHaveBeenCalledWith("join_session", { session_id: "s1" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions/s1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });
});

describe("joinSession: stops early", () => {
  it("lets requireUser()'s redirect through for a signed-out student, before the RPC", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login?next=%2Fsessions%2Fs1"));

    await expect(joinSession("s1", {}, new FormData())).rejects.toBeInstanceOf(Redirect);
    expect(server.rpc).not.toHaveBeenCalled();
  });
});

describe("joinSession: database refusals", () => {
  it("maps session_full to our own message, logs the original, and does not revalidate", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "session_full" } });

    const state = await joinSession("s1", {}, new FormData());

    expect(state).toEqual({ error: "This session is full." });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("joinSession: join_session failed", {
      code: "P0001",
      message: "session_full",
    });
  });

  it("never shows Postgres's own text for an unmapped error", async () => {
    server.rpc.mockResolvedValue({
      data: null,
      error: { code: "55P03", message: "could not obtain lock on row in relation \"sessions\"" },
    });

    const state = await joinSession("s1", {}, new FormData());

    expect(state.error).toBe("Something went wrong on our side. Try again in a moment.");
    expect(state.error).not.toMatch(/relation|lock/);
  });
});

describe("leaveSession: success", () => {
  it("calls leave_session with the session id and revalidates the session and the list", async () => {
    server.rpc.mockResolvedValue({ data: null, error: null });

    const state = await leaveSession("s1", {}, new FormData());

    expect(state).toEqual({});
    expect(server.rpc).toHaveBeenCalledWith("leave_session", { session_id: "s1" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions/s1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });
});

describe("leaveSession: stops early", () => {
  it("lets requireUser()'s redirect through for a signed-out student, before the RPC", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login?next=%2Fsessions%2Fs1"));

    await expect(leaveSession("s1", {}, new FormData())).rejects.toBeInstanceOf(Redirect);
    expect(server.rpc).not.toHaveBeenCalled();
  });
});

describe("leaveSession: database refusals", () => {
  it("maps host_cannot_leave to our own message", async () => {
    server.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "host_cannot_leave" },
    });

    const state = await leaveSession("s1", {}, new FormData());

    expect(state).toEqual({ error: "As the host, you can't leave — cancel the session instead." });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// S7 (US-09): editSession() and cancelSession(). As above, the database's own
// rules are tested against real Postgres in tests/db/edit-cancel-session.test.ts
// -- including that a non-host is refused. These check the order of the steps,
// what reaches update_session/cancel_session, and that no raw database text
// reaches the student.
// ---------------------------------------------------------------------------

describe("editSession", () => {
  it("resolves the place, normalises the course, updates, then returns to the session", async () => {
    const submitted = form();

    expect(await redirectOf(editSession("s1", {}, submitted))).toBe("/sessions/s1");

    expect(server.rpc).toHaveBeenNthCalledWith(1, "get_or_create_course", {
      p_department_code: "CS",
      p_course_number: "3251",
    });
    expect(server.rpc).toHaveBeenNthCalledWith(2, "update_session", {
      p_session_id: "s1",
      p_course_id: "course-1",
      p_location_id: "loc-1",
      p_location_label: "Featheringill Hall",
      p_room: "",
      p_topic: "Design patterns review",
      p_starts_at: submitted.get("startsAt"),
      p_ends_at: submitted.get("endsAt"),
      p_capacity: 4,
    });
  });

  it("spends a place lookup (SEC-05), and stops at the limit before calling Google", async () => {
    rateLimit.consumeRateLimit.mockResolvedValue({
      code: "PT429",
      message: "place_lookup_rate_limited",
      details: "20 of 20 hits",
    });

    const state = await editSession("s1", {}, form());

    expect(rateLimit.consumeRateLimit).toHaveBeenCalledWith("place_lookup");
    expect(places.resolvePlace).not.toHaveBeenCalled();
    expect(server.rpc).not.toHaveBeenCalled();
    expect(state.formError).toBe(
      "You've tried a lot of places in the last few minutes. Wait a few minutes, then try again.",
    );
  });

  it("revalidates the session page and the list", async () => {
    await redirectOf(editSession("s1", {}, form()));

    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions/s1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });

  it("requires a signed-in student with a display name before anything else", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login"));

    await expect(editSession("s1", {}, form())).rejects.toBeInstanceOf(Redirect);
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("reports a session that has gone without calling the database", async () => {
    sessions.getSession.mockResolvedValue(null);

    const state = await editSession("s1", {}, form());
    expect(state.formError).toBe("That session doesn't exist anymore.");
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("returns field errors without calling the database", async () => {
    const state = await editSession("s1", {}, form({ topic: "  " }));

    expect(state.fieldErrors?.topic).toEqual(["Say what you'll be studying."]);
    expect(server.rpc).not.toHaveBeenCalled();
    // The form is refilled with what was submitted.
    expect(state.values?.capacity).toBe("4");
  });

  it("takes the unchanged-start allowance from the database, not the form", async () => {
    // The stored start is in the past: this session is already in progress.
    const stored = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    sessions.getSession.mockResolvedValue({ id: "s1", startsAt: stored });

    // Submitting that same start is accepted -- the host is fixing the topic.
    // Acceptance shows up as the redirect, so there is no state to inspect.
    expect(await redirectOf(editSession("s1", {}, form({ startsAt: stored })))).toBe(
      "/sessions/s1",
    );

    // A DIFFERENT past start is still refused, even though the stored one is
    // also in the past: the allowance is "you did not move it", not "the
    // session already started".
    const moved = await editSession(
      "s1",
      {},
      form({ startsAt: new Date(Date.now() - 90 * 60 * 1000).toISOString() }),
    );
    expect(moved.fieldErrors?.startsAt).toEqual(["The start time has already passed."]);
  });

  it("maps update_session's refusals to our own copy", async () => {
    rpcReplies({ data: "course-1", error: null }, { error: { message: "not_session_host" } });

    const state = await editSession("s1", {}, form());
    expect(state.formError).toBe("Only the host can change or cancel this session.");
  });

  it("maps a capacity below the roster", async () => {
    rpcReplies({ data: "course-1", error: null }, { error: { message: "capacity_below_roster" } });

    const state = await editSession("s1", {}, form({ capacity: "2" }));
    expect(state.formError).toBe(
      "That's fewer seats than the students already coming. Nobody is removed by an edit.",
    );
  });

  it("never leaks raw database text", async () => {
    rpcReplies(
      { data: "course-1", error: null },
      { error: { code: "23514", message: 'violates check constraint "sessions_capacity_min"' } },
    );

    const state = await editSession("s1", {}, form());
    expect(state.formError).toBe("Capacity must be at least 2 — you count as one.");
    expect(state.formError).not.toContain("constraint");
  });

  it("reports a place it cannot resolve on the field, not the form", async () => {
    places.resolvePlace.mockRejectedValue(new PlaceError("unknown_place", "whatever"));

    const state = await editSession("s1", {}, form());
    expect(state.fieldErrors?.placeId).toHaveLength(1);
    expect(server.rpc).not.toHaveBeenCalled();
  });
});

describe("cancelSession", () => {
  it("calls cancel_session with the bound id and revalidates", async () => {
    server.rpc.mockResolvedValue({ error: null });

    expect(await cancelSession("s1", {}, new FormData())).toEqual({});
    expect(server.rpc).toHaveBeenCalledWith("cancel_session", { p_session_id: "s1" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions/s1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });

  it("requires a signed-in student first", async () => {
    server.requireUser.mockRejectedValue(new Redirect("/login"));

    await expect(cancelSession("s1", {}, new FormData())).rejects.toBeInstanceOf(Redirect);
    expect(server.rpc).not.toHaveBeenCalled();
  });

  it("maps a refusal and does not revalidate", async () => {
    server.rpc.mockResolvedValue({ error: { message: "not_session_host" } });

    const state = await cancelSession("s1", {}, new FormData());
    expect(state.error).toBe("Only the host can change or cancel this session.");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps an already-cancelled session", async () => {
    server.rpc.mockResolvedValue({ error: { message: "session_cancelled" } });

    const state = await cancelSession("s1", {}, new FormData());
    expect(state.error).toBe("This session has been cancelled.");
  });

  it("never leaks raw database text", async () => {
    server.rpc.mockResolvedValue({
      error: { code: "42P01", message: 'relation "public.sessions" does not exist' },
    });

    const state = await cancelSession("s1", {}, new FormData());
    expect(state.error).toBe("Something went wrong on our side. Try again in a moment.");
    expect(state.error).not.toContain("relation");
  });
});

// ---------------------------------------------------------------------------
// Study requests (US-16, R1). These two actions write through RLS POLICIES
// rather than an RPC, which moves the interesting question into TypeScript:
// which author_id is sent, and what happens when a delete legitimately
// matches nothing. The policies themselves are tested against real Postgres
// in tests/db/study-requests.test.ts, including both IDOR directions.
// ---------------------------------------------------------------------------

/** Calls made through `from(...)`, in order, so a test can assert on them. */
let tableCalls: { method: string; args: unknown[] }[];

/**
 * Stands in for the PostgREST table builder. `insert` and `delete` each set
 * the awaited result, so one builder serves both statements requestSession
 * makes.
 */
function tableReplies(
  options: {
    onDelete?: { error: unknown; count?: number | null };
    onInsert?: { error: unknown };
  } = {},
) {
  tableCalls = [];
  server.from.mockImplementation((table: string) => {
    tableCalls.push({ method: "from", args: [table] });
    let result: unknown = { error: null };
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    builder.delete = (...args: unknown[]) => {
      tableCalls.push({ method: "delete", args });
      result = options.onDelete ?? { error: null, count: 1 };
      return builder;
    };
    builder.insert = (...args: unknown[]) => {
      tableCalls.push({ method: "insert", args });
      result = options.onInsert ?? { error: null };
      return builder;
    };
    builder.eq = (...args: unknown[]) => {
      tableCalls.push({ method: "eq", args });
      return builder;
    };
    return builder;
  });
}

/** A submission that passes studyRequestSchema, as the form posts it. */
function askForm(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    departmentCode: "cs",
    courseNumber: "3251",
    note: "Tue evening would suit me",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const insertArg = () =>
  tableCalls.find((call) => call.method === "insert")?.args[0] as Record<string, unknown>;

describe("requestSession", () => {
  beforeEach(() => {
    tableReplies();
  });

  it("creates the course on use, then posts the request as the caller", async () => {
    const state = await requestSession({}, askForm());

    expect(state).toEqual({});
    // Normalised the same way the create-session form normalises it, so a
    // request and a session land on one `courses` row.
    expect(server.rpc).toHaveBeenCalledWith("get_or_create_course", {
      p_department_code: "CS",
      p_course_number: "3251",
    });
    expect(insertArg()).toEqual({
      course_id: "course-1",
      // THE ONE THAT MATTERS: the caller's own id, never anything off the
      // form. study_requests_insert refuses anything else, and
      // tests/db/study-requests.test.ts proves it does.
      author_id: "u1",
      note: "Tue evening would suit me",
    });
  });

  it("clears the caller's own earlier ask first, so asking again refreshes it", async () => {
    await requestSession({}, askForm());

    // Scoped to this course AND this author: the delete must not be able to
    // reach anyone else's row even though the policy would stop it anyway.
    const deleteIndex = tableCalls.findIndex((call) => call.method === "delete");
    const insertIndex = tableCalls.findIndex((call) => call.method === "insert");
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(deleteIndex).toBeLessThan(insertIndex);
    expect(tableCalls.filter((call) => call.method === "eq").map((call) => call.args)).toEqual([
      ["course_id", "course-1"],
      ["author_id", "u1"],
    ]);
  });

  it("refreshes the list and stays on it", async () => {
    await requestSession({}, askForm());

    // No redirect: the form is on /sessions, and the answer the student wants
    // is their own ask appearing there.
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });

  it("stores a blank note as null rather than an empty string", async () => {
    await requestSession({}, askForm({ note: "   " }));

    expect(insertArg().note).toBeNull();
  });

  it("refuses a note over the limit without touching the database", async () => {
    const state = await requestSession({}, askForm({ note: "x".repeat(201) }));

    expect(state.fieldErrors?.note?.[0]).toBe("Keep it to 200 characters or fewer.");
    expect(server.rpc).not.toHaveBeenCalled();
    expect(server.from).not.toHaveBeenCalled();
  });

  it("refuses a course number that is not a course number", async () => {
    const state = await requestSession({}, askForm({ courseNumber: "32" }));

    expect(state.fieldErrors?.courseNumber?.[0]).toBe(
      "Enter a 4-digit course number, like 3251 or 2100W.",
    );
    expect(state.values?.courseNumber).toBe("32");
    expect(server.from).not.toHaveBeenCalled();
  });

  it("gives up before inserting when the course cannot be created", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { message: "department_required" } });

    const state = await requestSession({}, askForm());

    expect(state.formError).toBe("Choose or add a department.");
    expect(server.from).not.toHaveBeenCalled();
  });

  it("explains a second ask for the same course in the student's words", async () => {
    tableReplies({
      onInsert: {
        error: {
          code: "23505",
          message:
            'duplicate key value violates unique constraint "study_requests_course_id_author_id_key"',
        },
      },
    });

    const state = await requestSession({}, askForm());

    // Reachable from two tabs even though the action deletes first.
    expect(state.formError).toBe("You've already asked for this course. Classmates can see it.");
    // The form comes back filled in, not blank.
    expect(state.values?.courseNumber).toBe("3251");
  });

  it("never shows raw Postgres text", async () => {
    tableReplies({ onInsert: { error: { code: "XX000", message: "could not write to disk" } } });

    const state = await requestSession({}, askForm());

    expect(state.formError).toBe("Something went wrong on our side. Try again in a moment.");
    expect(state.formError).not.toContain("disk");
  });
});

describe("withdrawRequest", () => {
  it("removes the request and refreshes the list", async () => {
    tableReplies({ onDelete: { error: null, count: 1 } });

    const state = await withdrawRequest("req-1", {}, new FormData());

    expect(state).toEqual({});
    expect(tableCalls).toContainEqual({ method: "eq", args: ["id", "req-1"] });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/sessions");
  });

  it("asks for an exact count, because RLS refuses a delete silently", async () => {
    tableReplies({ onDelete: { error: null, count: 1 } });

    await withdrawRequest("req-1", {}, new FormData());

    // Without this, a delete aimed at someone else's request -- which RLS
    // answers with no error and no rows -- would report success.
    expect(tableCalls).toContainEqual({ method: "delete", args: [{ count: "exact" }] });
  });

  it("says so when the delete matched nothing", async () => {
    tableReplies({ onDelete: { error: null, count: 0 } });

    const state = await withdrawRequest("someone-elses", {}, new FormData());

    expect(state.error).toBe("That request isn't there anymore.");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("maps a database error to our own message", async () => {
    tableReplies({ onDelete: { error: { code: "42501", message: "permission denied" }, count: null } });

    const state = await withdrawRequest("req-1", {}, new FormData());

    expect(state.error).toBe("You don't have permission to do that.");
  });
});

// ---------------------------------------------------------------------------
// The security log (SEC-09, src/lib/security-log.ts): one line per refused
// join or create, with the name the refusal was mapped by -- never
// Postgres's own text. (console.error above keeps that, for debugging.)
// ---------------------------------------------------------------------------

const USER = "0b6f7a52-3c1d-4e2f-9a8b-7c6d5e4f3a2b";
const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

/** The one security line logged, parsed. */
function securityLine(): Record<string, string> {
  expect(console.warn).toHaveBeenCalledTimes(1);
  const args = vi.mocked(console.warn).mock.calls[0];
  expect(args).toHaveLength(1);
  return JSON.parse(args[0] as string);
}

describe("security log (SEC-09)", () => {
  beforeEach(() => {
    server.requireUser.mockResolvedValue({ id: USER, displayName: "Priya" });
  });

  it("logs a refused join once, with the mapped reason, the student and the session", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "session_full" } });
    await joinSession(SESSION, {}, new FormData());

    expect(securityLine()).toMatchObject({
      log: "security",
      event: "session_join_refused",
      reason: "session_full",
      userId: USER,
      sessionId: SESSION,
    });
  });

  it("logs an unmapped join failure by its SQLSTATE, never Postgres's text", async () => {
    server.rpc.mockResolvedValue({
      data: null,
      error: { code: "55P03", message: 'could not obtain lock on row in relation "sessions"' },
    });
    await joinSession(SESSION, {}, new FormData());

    expect(securityLine().reason).toBe("sqlstate_55p03");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/lock|relation/);
  });

  it("logs nothing for a join that worked", async () => {
    server.rpc.mockResolvedValue({ data: null, error: null });
    await joinSession(SESSION, {}, new FormData());
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs a refused place once, with the place's reason", async () => {
    places.resolvePlace.mockRejectedValue(new PlaceError("outside_campus", "ChIJN1t_tDeuEmsRUsoyG83frY4"));
    await createSession({}, form());

    expect(securityLine()).toMatchObject({
      event: "session_create_refused",
      reason: "outside_campus",
      userId: USER,
    });
  });

  it("logs a refused course once, by the raised name", async () => {
    rpcReplies({ data: null, error: { code: "P0001", message: "invalid_course_number" } }, null);
    await createSession({}, form());
    expect(securityLine()).toMatchObject({ event: "session_create_refused", reason: "invalid_course_number" });
  });

  it("logs a refused session once, by constraint name, never Postgres's text or the form", async () => {
    rpcReplies(
      { data: "course-1", error: null },
      {
        data: null,
        error: {
          code: "23514",
          message: 'new row for relation "sessions" violates check constraint "sessions_capacity_min"',
          details: "Failing row contains (Design patterns review, …).",
        },
      },
    );
    await createSession({}, form());

    expect(securityLine()).toMatchObject({
      event: "session_create_refused",
      reason: "sessions_capacity_min",
      userId: USER,
    });
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(
      /violates|Failing row|Design patterns/,
    );
  });

  it("logs nothing for a session that was created, or a form refused before the database", async () => {
    await redirectOf(createSession({}, form()));
    await createSession({}, form({ capacity: "1" }));
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("logs a cancel by someone who is not the host, with the session", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "not_session_host" } });
    await cancelSession(SESSION, {}, new FormData());

    expect(securityLine()).toMatchObject({
      event: "session_cancel_refused",
      reason: "not_session_host",
      userId: USER,
      sessionId: SESSION,
    });
  });

  it("logs an edit by someone who is not the host, with the session", async () => {
    rpcReplies(
      { data: "course-1", error: null },
      { data: null, error: { code: "P0001", message: "not_session_host" } },
    );
    await editSession(SESSION, {}, form());

    expect(securityLine()).toMatchObject({
      event: "session_edit_refused",
      reason: "not_session_host",
      userId: USER,
      sessionId: SESSION,
    });
  });

});
