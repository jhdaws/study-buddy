// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { currentRequestId, formatLogLine, log, writeLogLine } from "./log";

// The structured log line (V6, #152). The request id it carries is set by
// src/proxy.ts (src/proxy.test.ts checks that); here headers() is faked.

const fakes = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => ({ headers: fakes.headers }));

const ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const NOW = new Date("2026-12-01T15:00:00.000Z");

beforeEach(() => {
  fakes.headers.mockResolvedValue(new Headers({ "x-request-id": ID }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  fakes.headers.mockReset();
});

describe("formatLogLine", () => {
  it("is one line of JSON with level, event, message, request id and time", () => {
    const text = formatLogLine("error", "join_session_failed", "joinSession: join_session failed", {
      reason: "session_full",
      code: "P0001",
    }, { requestId: ID, now: NOW });

    expect(text).not.toContain("\n");
    expect(JSON.parse(text)).toEqual({
      level: "error",
      event: "join_session_failed",
      message: "joinSession: join_session failed",
      requestId: ID,
      at: "2026-12-01T15:00:00.000Z",
      reason: "session_full",
      code: "P0001",
    });
  });

  it("leaves the request id out when there is none, or it is not one of ours", () => {
    expect(JSON.parse(formatLogLine("info", "started", "x", {}, { now: NOW }))).not.toHaveProperty("requestId");
    expect(
      JSON.parse(formatLogLine("info", "started", "x", {}, { requestId: "forged\nline", now: NOW })),
    ).not.toHaveProperty("requestId");
  });

  it("never lets a field overwrite level, event, message, requestId or at", () => {
    const line = JSON.parse(
      formatLogLine("info", "ok", "fine", { level: "error", event: "forged", at: "then", requestId: "x" }, {
        requestId: ID,
        now: NOW,
      }),
    );
    expect(line).toMatchObject({ level: "info", event: "ok", requestId: ID, at: NOW.toISOString() });
  });

  it("blanks email addresses and newlines, and cuts long strings", () => {
    const line = JSON.parse(
      formatLogLine("warn", "odd", "sign-in for priya@vanderbilt.edu failed\nforged line", {
        detail: `${"x".repeat(300)}`,
        who: 'Key (email)=("sam@vanderbilt.edu") already exists.',
      }, { now: NOW }),
    );

    expect(line.message).toBe("sign-in for [email] failed forged line");
    expect(line.who).not.toContain("vanderbilt.edu");
    expect(line.detail).toHaveLength(201);
  });

  it("keeps only flat scalar fields with sensible names", () => {
    const fields = {
      count: 3,
      ok: true,
      none: null,
      skipped: undefined,
      bad: Number.NaN,
      "bad key": "x",
      nested: { password: "hunter2" } as unknown as string,
    };
    const line = JSON.parse(formatLogLine("info", "mixed", "m", fields, { now: NOW }));

    expect(line).toMatchObject({ count: 3, ok: true, none: null, bad: null });
    expect(line).not.toHaveProperty("skipped");
    expect(line).not.toHaveProperty("bad key");
    expect(line).not.toHaveProperty("nested");
    expect(JSON.stringify(line)).not.toContain("hunter2");
  });

  it("replaces an event name that is not snake_case", () => {
    expect(JSON.parse(formatLogLine("info", "Not An Event", "m", {}, { now: NOW })).event).toBe(
      "invalid_event",
    );
  });
});

describe("writeLogLine", () => {
  it("sends error to stderr, warn to the warning stream and info to stdout", () => {
    writeLogLine("error", "e");
    writeLogLine("warn", "w");
    writeLogLine("info", "i");

    expect(console.error).toHaveBeenCalledExactlyOnceWith("e");
    expect(console.warn).toHaveBeenCalledExactlyOnceWith("w");
    expect(console.log).toHaveBeenCalledExactlyOnceWith("i");
  });
});

describe("log", () => {
  it("stamps the request's id from the header the proxy set", async () => {
    await log.error("create_session_failed", "createSession: create_session failed", { reason: "unmapped" });

    const line = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string);
    expect(line).toMatchObject({ level: "error", event: "create_session_failed", requestId: ID });
  });

  it("still logs, without an id, outside a request", async () => {
    fakes.headers.mockRejectedValue(new Error("headers was called outside a request scope"));

    await log.warn("no_request", "from a script");

    const line = JSON.parse(vi.mocked(console.warn).mock.calls[0][0] as string);
    expect(line).not.toHaveProperty("requestId");
    expect(line.level).toBe("warn");
  });

  it("never throws, even if writing fails", async () => {
    vi.mocked(console.log).mockImplementation(() => {
      throw new Error("stdout closed");
    });

    await expect(log.info("anything", "m")).resolves.toBeUndefined();
  });

  it("ignores a forged id in the header", async () => {
    fakes.headers.mockResolvedValue(new Headers({ "x-request-id": "not-a-uuid" }));

    await expect(currentRequestId()).resolves.toBeNull();
  });
});
