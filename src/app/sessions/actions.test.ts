// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaceError } from "@/lib/places";

import { createSession, joinSession, leaveSession } from "./actions";

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

const server = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: server.requireUser,
  createClient: async () => ({ rpc: server.rpc }),
}));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: cache.revalidatePath }));

// Keep the real PlaceError (and its messages); replace only the lookup.
const places = vi.hoisted(() => ({ resolvePlace: vi.fn() }));
vi.mock("@/lib/places", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places")>()),
  resolvePlace: places.resolvePlace,
}));

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
  rpcReplies({ data: "course-1", error: null }, { data: { id: "s1" }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  server.requireUser.mockReset();
  server.rpc.mockReset();
  places.resolvePlace.mockReset();
  cache.revalidatePath.mockReset();
});

describe("createSession: success", () => {
  it("resolves the place, creates the course on use, creates the session, then goes to the list", async () => {
    const submitted = form();

    expect(await redirectOf(createSession({}, submitted))).toBe("/sessions");

    expect(places.resolvePlace).toHaveBeenCalledWith("ChIJN1t_tDeuEmsRUsoyG83frY4");
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
