import { describe, expect, it } from "vitest";

import { continuePath, isAcceptedLinkType, loginWithLinkError } from "./email-link";

describe("isAcceptedLinkType", () => {
  it("accepts the types our emails carry, and nothing else", () => {
    for (const type of ["email", "magiclink", "signup"]) expect(isAcceptedLinkType(type)).toBe(true);
    for (const type of ["recovery", "invite", "email_change", "", null, undefined, 1]) {
      expect(isAcceptedLinkType(type)).toBe(false);
    }
  });
});

describe("continuePath", () => {
  it("carries the token, the type and a safe next to /login/continue", () => {
    const url = new URL(continuePath("abc123", "email", "/sessions/new"), "https://x.example");
    expect(url.pathname).toBe("/login/continue");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      token_hash: "abc123",
      type: "email",
      next: "/sessions/new",
    });
  });

  it("drops an off-site next", () => {
    const url = new URL(continuePath("abc123", "email", "//evil.example"), "https://x.example");
    expect(url.searchParams.get("next")).toBe("/sessions");
  });
});

describe("loginWithLinkError", () => {
  it("flags the failed link and keeps a safe next", () => {
    expect(loginWithLinkError("/sessions/new")).toBe("/login?error=link&next=%2Fsessions%2Fnew");
    expect(loginWithLinkError("https://evil.example")).toBe("/login?error=link&next=%2Fsessions");
  });
});
