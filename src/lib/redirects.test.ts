import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIGNED_IN_PATH,
  isPrivatePath,
  LOGIN_PATH,
  NAME_STEP_PATH,
  safeNextPath,
  sameOriginPath,
} from "@/lib/redirects";

describe("sameOriginPath", () => {
  it("accepts a plain absolute path", () => {
    expect(sameOriginPath("/sessions")).toBe("/sessions");
  });

  it("keeps a query string and a fragment", () => {
    expect(sameOriginPath("/sessions/new?from=home")).toBe(
      "/sessions/new?from=home",
    );
    expect(sameOriginPath("/sessions#list")).toBe("/sessions#list");
  });

  it("refuses an absolute URL", () => {
    expect(sameOriginPath("https://evil.example/")).toBeNull();
    expect(sameOriginPath("http://evil.example/")).toBeNull();
  });

  it("refuses a protocol-relative URL", () => {
    // A browser reads this as absolute: the classic way past a naive check.
    expect(sameOriginPath("//evil.example")).toBeNull();
    expect(sameOriginPath("//evil.example/sessions")).toBeNull();
  });

  it("refuses backslashes, which browsers normalise to slashes", () => {
    expect(sameOriginPath("/\\evil.example")).toBeNull();
    expect(sameOriginPath("/\\/evil.example")).toBeNull();
    expect(sameOriginPath("\\\\evil.example")).toBeNull();
  });

  it("refuses control characters that browsers strip from URLs", () => {
    expect(sameOriginPath("/\tevil.example")).toBeNull();
    expect(sameOriginPath("/\nevil.example")).toBeNull();
    expect(sameOriginPath("/\r/evil.example")).toBeNull();
    expect(sameOriginPath("/sessions\u0000")).toBeNull();
  });

  it("refuses a bare host or relative path", () => {
    expect(sameOriginPath("evil.example")).toBeNull();
    expect(sameOriginPath("sessions")).toBeNull();
    expect(sameOriginPath("../sessions")).toBeNull();
  });

  it("refuses anything that is not a non-empty string", () => {
    expect(sameOriginPath("")).toBeNull();
    expect(sameOriginPath(null)).toBeNull();
    expect(sameOriginPath(undefined)).toBeNull();
    expect(sameOriginPath(42)).toBeNull();
    // FormData.get() returns a File for a file input.
    expect(sameOriginPath(new Blob())).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("passes a same-origin path through", () => {
    expect(safeNextPath("/sessions/new")).toBe("/sessions/new");
  });

  it("falls back to the default for anything it refuses", () => {
    expect(safeNextPath("https://evil.example/")).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeNextPath(null)).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

describe("isPrivatePath", () => {
  it("gates the session list and everything under it", () => {
    expect(isPrivatePath("/sessions")).toBe(true);
    expect(isPrivatePath("/sessions/new")).toBe(true);
    expect(isPrivatePath("/sessions/abc-123")).toBe(true);
  });

  it("leaves the home page and the sign-in journey open", () => {
    // Gating any of these would make signing in impossible.
    expect(isPrivatePath("/")).toBe(false);
    expect(isPrivatePath(LOGIN_PATH)).toBe(false);
    expect(isPrivatePath(NAME_STEP_PATH)).toBe(false);
    expect(isPrivatePath("/auth/confirm")).toBe(false);
  });

  it("leaves API routes alone", () => {
    // docs/contracts.md: the proxy must never redirect /api/*.
    expect(isPrivatePath("/api/courses")).toBe(false);
  });

  it("does not gate a path that merely starts with the same letters", () => {
    expect(isPrivatePath("/sessions-archive")).toBe(false);
    expect(isPrivatePath("/sessionsomething")).toBe(false);
  });
});
