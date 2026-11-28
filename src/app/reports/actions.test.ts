// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reportUser } from "./actions";

// reportUser() (US-18) with requireUser() and the database replaced. The
// database's own rules -- the reporter is always the caller, never yourself,
// no reads, 5 a day -- are tested against real Postgres in
// tests/db/reports.test.ts.

class Redirect extends Error {
  constructor(readonly path: string) {
    super(`redirect to ${path}`);
  }
}

const fakes = vi.hoisted(() => ({
  requireUser: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  // session_messages: .select(...).eq("id", ...).maybeSingle()
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireUser: fakes.requireUser,
  createClient: async () => ({ from: fakes.from }),
}));

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = (overrides: Record<string, string> = {}) =>
  form({ reportedUserId: SAM, sessionId: SESSION, reason: "harassment", note: "", ...overrides });

beforeEach(() => {
  fakes.requireUser.mockResolvedValue({ id: ME, displayName: "Priya" });
  fakes.insert.mockResolvedValue({ error: null });
  fakes.from.mockImplementation((table: string) =>
    table === "session_messages" ? { select: fakes.select } : { insert: fakes.insert },
  );
  fakes.select.mockReturnValue({ eq: fakes.eq });
  fakes.eq.mockReturnValue({ maybeSingle: fakes.maybeSingle });
  fakes.maybeSingle.mockResolvedValue({ data: { author_id: SAM, session_id: SESSION }, error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const fake of Object.values(fakes)) fake.mockReset();
});

describe("reportUser", () => {
  it("inserts the report, trimmed, and says it was sent", async () => {
    const state = await reportUser({}, valid({ note: "  Kept messaging me  " }));

    expect(state).toEqual({ sent: true });
    expect(fakes.from).toHaveBeenCalledWith("reports");
    expect(fakes.insert).toHaveBeenCalledWith({
      reported_user_id: SAM,
      session_id: SESSION,
      reason: "harassment",
      note: "Kept messaging me",
    });
  });

  it("never sends a reporter: the database takes it from the session", async () => {
    await reportUser({}, valid({ reporterId: SAM, reporter_id: SAM }));
    const [row] = fakes.insert.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(row).sort()).toEqual(["note", "reason", "reported_user_id", "session_id"]);
  });

  it("sends a blank note and a missing session as null", async () => {
    await reportUser({}, form({ reportedUserId: SAM, reason: "other" }));
    expect(fakes.insert).toHaveBeenCalledWith({
      reported_user_id: SAM,
      session_id: null,
      reason: "other",
      note: null,
    });
  });

  it("refuses a report about yourself before the database does", async () => {
    const state = await reportUser({}, valid({ reportedUserId: ME }));
    expect(state.formError).toBe("You can't report yourself.");
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("checks the caller first", async () => {
    fakes.requireUser.mockRejectedValue(new Redirect("/login"));
    await expect(reportUser({}, valid())).rejects.toBeInstanceOf(Redirect);
    expect(fakes.from).not.toHaveBeenCalled();
  });

  it.each([
    ["no reason", { reason: "" }, "reason", "Choose a reason."],
    ["an unknown reason", { reason: "rude" }, "reason", "Choose a reason."],
    ["a note over 500 characters", { note: "x".repeat(501) }, "note", "500 characters"],
    ["a reported id that is not a uuid", { reportedUserId: "sam" }, "reportedUserId", "Choose who"],
    ["a session id that is not a uuid", { sessionId: "nope" }, "sessionId", "isn't valid"],
  ])("returns a field error for %s, and inserts nothing", async (_label, overrides, field, message) => {
    const state = await reportUser({}, valid(overrides));
    expect(state.fieldErrors?.[field as "reason"]?.[0]).toContain(message);
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("maps the daily limit to our own words, keeping what was typed", async () => {
    fakes.insert.mockResolvedValue({ error: { code: "PT429", message: "report_limit_reached" } });
    const state = await reportUser({}, valid({ note: "Again" }));
    expect(state.formError).toMatch(/5 reports in the last day/);
    expect(state.values?.note).toBe("Again");
    expect(state.sent).toBeUndefined();
  });

  it("never shows raw database text", async () => {
    fakes.insert.mockResolvedValue({
      error: { code: "42501", message: 'new row violates row-level security policy for table "reports"' },
    });
    const state = await reportUser({}, valid());
    expect(state.formError).toBe("You don't have permission to do that.");
  });
});

// P5 (#156): reporting one chat message. Who is reported, and in which
// session, come from the message as RLS lets the caller read it -- never the
// form. The database's own check (reports_insert_message_seen) and the
// one-report-per-message index are tested in tests/db/reports.test.ts.
describe("reportUser: a chat message", () => {
  const MESSAGE = "22222222-2222-4222-8222-222222222222";
  const OTHER_SESSION = "33333333-3333-4333-8333-333333333333";
  const messageForm = (overrides: Record<string, string> = {}) =>
    valid({ messageId: MESSAGE, ...overrides });

  it("reads the message through the caller's client and reports its author, in its session", async () => {
    // The form claims someone else and another session; the message wins.
    const state = await reportUser({}, messageForm({ reportedUserId: SAM, sessionId: OTHER_SESSION }));

    expect(state).toEqual({ sent: true });
    expect(fakes.from).toHaveBeenCalledWith("session_messages");
    expect(fakes.select).toHaveBeenCalledWith("author_id, session_id");
    expect(fakes.eq).toHaveBeenCalledWith("id", MESSAGE);
    expect(fakes.insert).toHaveBeenCalledWith({
      reported_user_id: SAM,
      session_id: SESSION,
      message_id: MESSAGE,
      reason: "harassment",
      note: null,
    });
  });

  it("says the message is gone when the caller cannot read it, and inserts nothing", async () => {
    fakes.maybeSingle.mockResolvedValue({ data: null, error: null });

    const state = await reportUser({}, messageForm({ note: "Rude" }));

    expect(state.formError).toBe("That message isn't there anymore.");
    expect(state.values?.note).toBe("Rude");
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("refuses your own message, whatever the form says", async () => {
    fakes.maybeSingle.mockResolvedValue({ data: { author_id: ME, session_id: SESSION }, error: null });

    const state = await reportUser({}, messageForm({ reportedUserId: SAM }));

    expect(state.formError).toBe("You can't report your own message.");
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("refuses a message whose author deleted their account", async () => {
    fakes.maybeSingle.mockResolvedValue({ data: { author_id: null, session_id: SESSION }, error: null });

    const state = await reportUser({}, messageForm());

    expect(state.formError).toMatch(/deleted their account/);
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("maps a second report of the same message to our own words", async () => {
    fakes.insert.mockResolvedValue({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "reports_reporter_message_key"' },
    });

    const state = await reportUser({}, messageForm());

    expect(state.formError).toMatch(/already reported this message/);
    expect(state.sent).toBeUndefined();
  });

  it("does not show a failed read's text, and logs only its code", async () => {
    fakes.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: "42P01", message: 'relation "session_messages" does not exist' },
    });

    const state = await reportUser({}, messageForm());

    expect(state.formError).toBe("Something went wrong on our side. Try again in a moment.");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/relation/);
    expect(fakes.insert).not.toHaveBeenCalled();
  });

  it("returns a field error for a message id that is not a uuid", async () => {
    const state = await reportUser({}, messageForm({ messageId: "m1" }));

    expect(state.fieldErrors?.messageId?.[0]).toBe("That message isn't valid.");
    expect(fakes.from).not.toHaveBeenCalled();
  });

  it("leaves a user report as it was: no message read, no message_id", async () => {
    await reportUser({}, valid());

    expect(fakes.from).not.toHaveBeenCalledWith("session_messages");
    expect(fakes.insert.mock.calls[0][0]).not.toHaveProperty("message_id");
  });
});
