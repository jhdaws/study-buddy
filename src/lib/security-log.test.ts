// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashEmail, logSecurityEvent } from "./security-log";

// `printf 'jane@vanderbilt.edu' | shasum -a 256`
const JANE_HASH = "9cf968134a5b36bb008913e2977899e28cd8f2d16047e465f82be320a63c4eb1";
const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The one line logged, parsed. Fails unless exactly one call with one string argument. */
function loggedLine(): Record<string, string> {
  expect(warn).toHaveBeenCalledTimes(1);
  const args = warn.mock.calls[0];
  expect(args).toHaveLength(1);
  expect(typeof args[0]).toBe("string");
  expect(args[0]).not.toMatch(/[\r\n]/);
  return JSON.parse(args[0] as string);
}

describe("hashEmail", () => {
  it("is SHA-256 hex of the trimmed, lower-cased address", () => {
    expect(hashEmail("jane@vanderbilt.edu")).toBe(JANE_HASH);
    expect(hashEmail("  Jane@Vanderbilt.EDU ")).toBe(JANE_HASH);
    expect(hashEmail("john@vanderbilt.edu")).not.toBe(JANE_HASH);
  });
});

describe("logSecurityEvent", () => {
  it("writes one single-line JSON warning with the event, reason and time", () => {
    vi.useFakeTimers({ now: new Date("2026-11-09T20:00:00.000Z") });
    try {
      logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1" });
    } finally {
      vi.useRealTimers();
    }
    expect(loggedLine()).toEqual({
      log: "security",
      event: "session_join_refused",
      reason: "session_full",
      at: "2026-11-09T20:00:00.000Z",
      userId: "u1",
    });
  });

  it("logs a hash of the email, never the address", () => {
    logSecurityEvent({ event: "sign_in_password_failed", reason: "invalid_credentials", email: "Jane@Vanderbilt.edu" });
    const line = loggedLine();
    expect(line.emailHash).toBe(JANE_HASH);
    expect(line).not.toHaveProperty("email");
    expect(JSON.stringify(warn.mock.calls).toLowerCase()).not.toContain("jane@vanderbilt.edu");
  });

  it.each([
    "Token has expired or is invalid",
    'new row for relation "sessions" violates check constraint "sessions_capacity_min"',
    "Invalid login credentials",
    "",
  ])("logs %j as invalid_reason: a reason must be a code, never error text", (text) => {
    logSecurityEvent({ event: "sign_in_code_failed", reason: text, email: "jane@vanderbilt.edu" });
    expect(loggedLine().reason).toBe("invalid_reason");
    if (text) expect(JSON.stringify(warn.mock.calls)).not.toContain(text);
  });

  it("keeps a well-formed session id, and replaces anything else the browser sent", () => {
    logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1", sessionId: SESSION });
    expect(loggedLine().sessionId).toBe(SESSION);

    warn.mockClear();
    const forged = `${SESSION}\n{"log":"security","event":"forged"}`;
    logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1", sessionId: forged });
    expect(loggedLine().sessionId).toBe("invalid_id");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("forged");
  });

  it("leaves out who and what when they are not known", () => {
    logSecurityEvent({ event: "session_create_refused", reason: "unmapped" });
    expect(Object.keys(loggedLine()).sort()).toEqual(["at", "event", "log", "reason"]);
  });
});
