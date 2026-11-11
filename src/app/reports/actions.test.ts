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
  fakes.from.mockReturnValue({ insert: fakes.insert });
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
