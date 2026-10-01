import { describe, expect, it } from "vitest";

import {
  CODE_RATE_LIMITED_MESSAGE,
  CODE_REJECTED_MESSAGE,
  databaseErrorMessage,
  GENERIC_ERROR_MESSAGE,
  SIGN_IN_RATE_LIMITED_MESSAGE,
  signInErrorMessage,
  verifyCodeErrorMessage,
} from "./errors";

// The error shapes below are copied from what PostgREST and Supabase Auth
// return, not invented: a PostgREST error carries the SQLSTATE in `code` and
// Postgres's text in `message`; an AuthError carries a string `code` and an
// HTTP `status`.

const RAW_TEXT = /violates|relation|constraint|profiles_|auth\.users|Database error/;

describe("databaseErrorMessage", () => {
  it("maps the display-name CHECK (A2) by constraint name", () => {
    const message = databaseErrorMessage({
      code: "23514",
      message:
        'new row for relation "profiles" violates check constraint "profiles_display_name_check"',
      details: "Failing row contains (…).",
    });
    expect(message).toMatch(/1 to 50 characters/);
    expect(message).not.toMatch(RAW_TEXT);
  });

  it("maps the Vanderbilt-only trigger (A2) by constraint name", () => {
    const message = databaseErrorMessage({
      code: "23514",
      // Worded as the trigger in *_profile_rules.sql raises it.
      message:
        'new row for relation "users" violates constraint "auth_users_vanderbilt_email": only @vanderbilt.edu email addresses can sign up',
    });
    expect(message).toBe("Use your @vanderbilt.edu email address.");
  });

  it("maps a refused write (42501) without naming the table", () => {
    const message = databaseErrorMessage({
      code: "42501",
      message: 'permission denied for table profiles',
    });
    expect(message).toBe("You don't have permission to do that.");
  });

  it("falls back to a generic message, never the raw text", () => {
    for (const error of [
      { code: "23514", message: 'new row violates check constraint "some_other_check"' },
      { code: "XX000", message: "internal error in relation sessions" },
      { message: "fetch failed" },
      {},
      null,
      undefined,
    ]) {
      expect(databaseErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
    }
  });
});

describe("signInErrorMessage", () => {
  it("maps both rate limits to the same message", () => {
    expect(
      signInErrorMessage({
        code: "over_email_send_rate_limit",
        status: 429,
        message: "For security purposes, you can only request this after 42 seconds.",
      }),
    ).toBe(SIGN_IN_RATE_LIMITED_MESSAGE);
    expect(signInErrorMessage({ code: "over_request_rate_limit", status: 429 })).toBe(
      SIGN_IN_RATE_LIMITED_MESSAGE,
    );
    // A 429 with no code we know is still a rate limit.
    expect(signInErrorMessage({ status: 429, message: "Too Many Requests" })).toBe(
      SIGN_IN_RATE_LIMITED_MESSAGE,
    );
  });

  it("maps A2's trigger refusing a signup without leaking the database text", () => {
    const message = signInErrorMessage({
      code: "unexpected_failure",
      status: 500,
      message: "Database error saving new user",
    });
    expect(message).toMatch(/@vanderbilt\.edu/);
    expect(message).not.toMatch(RAW_TEXT);
  });

  it("explains the built-in email service refusing a non-team address", () => {
    expect(
      signInErrorMessage({
        code: "email_address_not_authorized",
        status: 400,
        message: "Email address \"x@vanderbilt.edu\" cannot be used as it is not authorized",
      }),
    ).toMatch(/can't send sign-in emails to that address yet/);
  });

  it("maps an invalid address and a disabled provider", () => {
    expect(signInErrorMessage({ code: "email_address_invalid", status: 400 })).toMatch(
      /valid Vanderbilt email/,
    );
    expect(signInErrorMessage({ code: "signup_disabled", status: 422 })).toMatch(/switched off/);
  });

  it("falls back to a generic message, never the raw text", () => {
    for (const error of [
      { code: "unexpected_failure", status: 500, message: "connection refused to 10.0.0.1" },
      { message: "fetch failed" },
      {},
      null,
    ]) {
      expect(signInErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
    }
  });
});

describe("verifyCodeErrorMessage", () => {
  it("gives one message for a wrong code and an expired one", () => {
    // Supabase Auth answers both with this.
    expect(
      verifyCodeErrorMessage({
        code: "otp_expired",
        status: 403,
        message: "Token has expired or is invalid",
      }),
    ).toBe(CODE_REJECTED_MESSAGE);
    expect(verifyCodeErrorMessage({ status: 403, message: "Forbidden" })).toBe(
      CODE_REJECTED_MESSAGE,
    );
    expect(CODE_REJECTED_MESSAGE).not.toMatch(/Token|invalid/);
  });

  it("maps the verification rate limit", () => {
    expect(verifyCodeErrorMessage({ code: "over_request_rate_limit", status: 429 })).toBe(
      CODE_RATE_LIMITED_MESSAGE,
    );
    expect(verifyCodeErrorMessage({ status: 429 })).toBe(CODE_RATE_LIMITED_MESSAGE);
  });

  it("falls back to a generic message, never the raw text", () => {
    expect(
      verifyCodeErrorMessage({ code: "unexpected_failure", status: 500, message: "db down" }),
    ).toBe(GENERIC_ERROR_MESSAGE);
    expect(verifyCodeErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
