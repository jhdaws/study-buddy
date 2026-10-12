import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "@/lib/errors";

describe("signInErrorMessage", () => {
  it("names the rate limit when Supabase reports one by status", () => {
    expect(signInErrorMessage({ status: 429, message: "rate limited" })).toMatch(
      /too many sign-in emails/i,
    );
  });

  it("names the rate limit when Supabase reports one by code", () => {
    expect(
      signInErrorMessage({ code: "over_email_send_rate_limit" }),
    ).toMatch(/too many sign-in emails/i);
  });

  it("explains the domain rule when the signup trigger refuses", () => {
    // GoTrue's wording when a before-insert trigger on auth.users raises.
    expect(
      signInErrorMessage({
        code: "unexpected_failure",
        status: 500,
        message: "Database error saving new user",
      }),
    ).toMatch(/@vanderbilt\.edu/);
  });

  it("explains the domain rule when the trigger's own message comes through", () => {
    expect(
      signInErrorMessage({
        message: "Only @vanderbilt.edu email addresses can sign up.",
      }),
    ).toMatch(/@vanderbilt\.edu/);
  });

  it("reports an invalid address", () => {
    expect(signInErrorMessage({ code: "email_address_invalid" })).toMatch(
      /isn't valid/i,
    );
  });

  it("falls back to a generic message for anything unrecognised", () => {
    const message = signInErrorMessage({
      code: "something_new",
      status: 500,
      message: "pq: relation \"auth.flow_state\" does not exist",
    });

    expect(message).toMatch(/something went wrong/i);
    // Never the raw text: it names internals and is written for us, not them.
    expect(message).not.toMatch(/flow_state/);
  });

  it("copes with an error carrying nothing useful", () => {
    expect(signInErrorMessage({})).toMatch(/something went wrong/i);
  });

  it("never mentions whether the account already exists", () => {
    // ADR 0003: the reply must be the same either way.
    const messages = [
      signInErrorMessage({ status: 429 }),
      signInErrorMessage({ code: "email_address_invalid" }),
      signInErrorMessage({}),
    ];

    for (const message of messages) {
      expect(message).not.toMatch(/already|exists|registered|unknown user/i);
    }
  });
});
