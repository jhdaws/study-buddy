import { describe, expect, it } from "vitest";

import { ACCOUNT_DELETED_PATH, isAccountDeletedNotice } from "./account";

describe("isAccountDeletedNotice", () => {
  it("recognises the path deleteAccount() redirects to", () => {
    const params = Object.fromEntries(new URL(ACCOUNT_DELETED_PATH, "https://x.test").searchParams);
    expect(isAccountDeletedNotice(params)).toBe(true);
  });

  it.each([{}, { account: "other" }, { account: undefined }, { deleted: "1" }])(
    "is false for %j",
    (params) => {
      expect(isAccountDeletedNotice(params)).toBe(false);
    },
  );

  it("reads the first of a repeated parameter", () => {
    expect(isAccountDeletedNotice({ account: ["deleted", "x"] })).toBe(true);
    expect(isAccountDeletedNotice({ account: ["x", "deleted"] })).toBe(false);
  });
});
