// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hashEmail, logSecurityEvent } from "./security-log";

// headers() is faked so a line can carry the request ID the proxy set (V6).
const fakes = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers: fakes.headers }));

// `printf 'jane@vanderbilt.edu' | shasum -a 256`
const JANE_HASH = "9cf968134a5b36bb008913e2977899e28cd8f2d16047e465f82be320a63c4eb1";
const SESSION = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  // Outside a request, as most of these tests are.
  fakes.headers.mockRejectedValue(new Error("outside a request scope"));
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
  it("is SHA-256 hex of the trimmed, lower-cased address", async () => {
    expect(hashEmail("jane@vanderbilt.edu")).toBe(JANE_HASH);
    expect(hashEmail("  Jane@Vanderbilt.EDU ")).toBe(JANE_HASH);
    expect(hashEmail("john@vanderbilt.edu")).not.toBe(JANE_HASH);
  });
});

describe("logSecurityEvent", () => {
  it("writes one single-line JSON warning with the level, event, reason and time", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-09T20:00:00.000Z") });
    try {
      await logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1" });
    } finally {
      vi.useRealTimers();
    }
    expect(loggedLine()).toEqual({
      level: "warn",
      event: "session_join_refused",
      message: "security: session_join_refused",
      at: "2026-11-09T20:00:00.000Z",
      log: "security",
      reason: "session_full",
      userId: "u1",
    });
  });

  it("logs a hash of the email, never the address", async () => {
    await logSecurityEvent({ event: "sign_in_password_failed", reason: "invalid_credentials", email: "Jane@Vanderbilt.edu" });
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
  ])("logs %j as invalid_reason: a reason must be a code, never error text", async (text) => {
    await logSecurityEvent({ event: "sign_in_code_failed", reason: text, email: "jane@vanderbilt.edu" });
    expect(loggedLine().reason).toBe("invalid_reason");
    if (text) expect(JSON.stringify(warn.mock.calls)).not.toContain(text);
  });

  it("keeps a well-formed session id, and replaces anything else the browser sent", async () => {
    await logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1", sessionId: SESSION });
    expect(loggedLine().sessionId).toBe(SESSION);

    warn.mockClear();
    const forged = `${SESSION}\n{"log":"security","event":"forged"}`;
    await logSecurityEvent({ event: "session_join_refused", reason: "session_full", userId: "u1", sessionId: forged });
    expect(loggedLine().sessionId).toBe("invalid_id");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("forged");
  });

  it("leaves out who and what when they are not known", async () => {
    await logSecurityEvent({ event: "session_create_refused", reason: "unmapped" });
    expect(Object.keys(loggedLine()).sort()).toEqual(["at", "event", "level", "log", "message", "reason"]);
  });

  it("carries the request ID the proxy set, so the request's other lines can be found (V6)", async () => {
    const id = "0b8c4a2e-9f3d-4e1a-b6c7-5d4e3f2a1b0c";
    fakes.headers.mockResolvedValue(new Headers({ "x-request-id": id }));

    await logSecurityEvent({ event: "chat_post_refused", reason: "sqlstate_42501", userId: "u1" });

    expect(loggedLine().requestId).toBe(id);
  });

  it("never throws, even if the log cannot be written", async () => {
    warn.mockImplementation(() => {
      throw new Error("stderr closed");
    });

    await expect(logSecurityEvent({ event: "session_join_refused", reason: "x" })).resolves.toBeUndefined();
  });
});
