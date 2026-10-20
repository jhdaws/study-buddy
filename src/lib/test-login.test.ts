import { describe, expect, it } from "vitest";

import { isTestLoginEmail, testLoginEmail } from "./test-login";

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("testLoginEmail", () => {
  it("is off when TEST_LOGIN_EMAIL is unset or blank", () => {
    expect(testLoginEmail(env({}))).toBeNull();
    expect(testLoginEmail(env({ TEST_LOGIN_EMAIL: "  " }))).toBeNull();
  });

  it("is on locally and on previews, lower-cased", () => {
    expect(testLoginEmail(env({ TEST_LOGIN_EMAIL: " Group4@Vanderbilt.edu " }))).toBe(
      "group4@vanderbilt.edu",
    );
    expect(
      testLoginEmail(env({ TEST_LOGIN_EMAIL: "group4@vanderbilt.edu", VERCEL_ENV: "preview" })),
    ).toBe("group4@vanderbilt.edu");
  });

  it("is on for the team's test address on previews with nothing set", () => {
    expect(testLoginEmail(env({ VERCEL_ENV: "preview" }))).toBe("group4@vanderbilt.edu");
  });

  it("is off on production with nothing set", () => {
    expect(testLoginEmail(env({ VERCEL_ENV: "production" }))).toBeNull();
  });

  it("is always off on Vercel production, even if the variable is set", () => {
    expect(
      testLoginEmail(env({ TEST_LOGIN_EMAIL: "group4@vanderbilt.edu", VERCEL_ENV: "production" })),
    ).toBeNull();
  });
});

describe("isTestLoginEmail", () => {
  const on = env({ TEST_LOGIN_EMAIL: "group4@vanderbilt.edu" });

  it("matches the test address, ignoring case and spaces", () => {
    expect(isTestLoginEmail(" GROUP4@vanderbilt.edu", on)).toBe(true);
  });

  it("does not match anyone else, or anyone when off", () => {
    expect(isTestLoginEmail("jane@vanderbilt.edu", on)).toBe(false);
    expect(isTestLoginEmail("group4@vanderbilt.edu", env({}))).toBe(false);
  });
});
