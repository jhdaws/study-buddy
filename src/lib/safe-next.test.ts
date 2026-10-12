import { describe, expect, it } from "vitest";

import {
  DEFAULT_NEXT_PATH,
  displayNamePath,
  firstParam,
  loginPath,
  safeNext,
  safeNextPath,
} from "./safe-next";

describe("safeNextPath", () => {
  it.each([
    ["/sessions", "/sessions"],
    ["/sessions/new", "/sessions/new"],
    ["/sessions?course=CS%203251#top", "/sessions?course=CS%203251#top"],
    ["/", "/"],
    // Dot segments are resolved, and can never climb above the root.
    ["/sessions/../login", "/login"],
    ["/../../etc", "/etc"],
    // Percent-encoded slashes stay encoded: still a path on this site.
    ["/%2F%2Fevil.example", "/%2F%2Fevil.example"],
  ])("keeps the same-origin path %j", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    // Not a path at all.
    "https://evil.example",
    "http://evil.example/sessions",
    "javascript:alert(1)",
    "data:text/html,hi",
    "sessions",
    "evil.example",
    "",
    // Protocol-relative, and the backslash form browsers treat the same way.
    "//evil.example",
    "//evil.example/sessions",
    "/\\evil.example",
    "/\\/evil.example",
    "\\\\evil.example",
    // Tabs and newlines are stripped by browsers, turning these into //...
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    // Other whitespace and control characters.
    "/ /evil.example",
    "/\u00a0sessions",
    "/sessions\u0000",
    // Absurdly long.
    `/${"a".repeat(2048)}`,
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });

  it("rejects anything that is not a string", () => {
    for (const input of [undefined, null, 42, ["/sessions"], { next: "/sessions" }]) {
      expect(safeNextPath(input)).toBeNull();
    }
  });
});

describe("safeNext", () => {
  it("falls back to the session list", () => {
    expect(DEFAULT_NEXT_PATH).toBe("/sessions");
    expect(safeNext("//evil.example")).toBe("/sessions");
    expect(safeNext(null)).toBe("/sessions");
    expect(safeNext("/sessions/new")).toBe("/sessions/new");
  });
});

describe("firstParam", () => {
  it("takes the first of a repeated search param", () => {
    expect(firstParam(["/a", "/b"])).toBe("/a");
    expect(firstParam("/a")).toBe("/a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});

describe("loginPath and displayNamePath", () => {
  it("carry a safe next, encoded", () => {
    expect(loginPath("/sessions/new")).toBe("/login?next=%2Fsessions%2Fnew");
    expect(displayNamePath("/sessions/new?x=1")).toBe(
      "/login/name?next=%2Fsessions%2Fnew%3Fx%3D1",
    );
  });

  it("drop an unsafe or default next", () => {
    expect(loginPath("https://evil.example")).toBe("/login");
    expect(loginPath("/sessions")).toBe("/login");
    expect(loginPath()).toBe("/login");
    expect(displayNamePath("//evil.example")).toBe("/login/name");
  });
});
