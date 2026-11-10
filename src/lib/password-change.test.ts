import { describe, expect, it } from "vitest";

import { FRESH_CODE_SECONDS, latestCodeSignIn, mayChoosePassword } from "./password-change";

const NOW = 1_800_000_000;

describe("latestCodeSignIn", () => {
  it("finds the latest mailbox sign-in and ignores password ones", () => {
    expect(
      latestCodeSignIn([
        { method: "otp", timestamp: NOW - 900 },
        { method: "password", timestamp: NOW - 10 },
        { method: "magiclink", timestamp: NOW - 300 },
      ]),
    ).toBe(NOW - 300);
  });

  it.each([
    ["no amr", undefined],
    ["the timestamp-free string form", ["otp"]],
    ["only a password sign-in", [{ method: "password", timestamp: NOW }]],
    ["a missing or non-numeric timestamp", [{ method: "otp" }, { method: "otp", timestamp: "now" }]],
    ["a non-finite timestamp", [{ method: "otp", timestamp: Number.NaN }]],
    ["junk entries", [null, 7, "otp"]],
  ])("is null for %s", (_label, amr) => {
    expect(latestCodeSignIn(amr)).toBeNull();
  });
});

describe("mayChoosePassword", () => {
  const code = (agoSeconds: number) => [{ method: "otp", timestamp: NOW - agoSeconds }];

  it("always lets a student without a password choose one", () => {
    expect(mayChoosePassword({ hasPassword: false, amr: undefined, nowSeconds: NOW })).toBe(true);
    expect(
      mayChoosePassword({ hasPassword: false, amr: [{ method: "password", timestamp: NOW }], nowSeconds: NOW }),
    ).toBe(true);
  });

  it("lets a student with a password change it right after a code sign-in", () => {
    expect(mayChoosePassword({ hasPassword: true, amr: code(0), nowSeconds: NOW })).toBe(true);
    expect(mayChoosePassword({ hasPassword: true, amr: code(FRESH_CODE_SECONDS), nowSeconds: NOW })).toBe(true);
  });

  it("refuses once the code sign-in is older than the window", () => {
    expect(mayChoosePassword({ hasPassword: true, amr: code(FRESH_CODE_SECONDS + 1), nowSeconds: NOW })).toBe(
      false,
    );
  });

  it("refuses a session that signed in with the password, or has no amr", () => {
    expect(
      mayChoosePassword({ hasPassword: true, amr: [{ method: "password", timestamp: NOW }], nowSeconds: NOW }),
    ).toBe(false);
    expect(mayChoosePassword({ hasPassword: true, amr: undefined, nowSeconds: NOW })).toBe(false);
  });

  it("tolerates a minute of clock skew, but not a timestamp far in the future", () => {
    expect(mayChoosePassword({ hasPassword: true, amr: code(-30), nowSeconds: NOW })).toBe(true);
    expect(mayChoosePassword({ hasPassword: true, amr: code(-3600), nowSeconds: NOW })).toBe(false);
  });
});
