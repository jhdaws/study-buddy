import { describe, expect, it } from "vitest";

import {
  authErrorReason,
  databaseErrorMessage,
  databaseErrorReason,
  GENERIC_ERROR_MESSAGE,
  type DatabaseErrorLike,
} from "./errors";

// The reason codes the security log records (SEC-09, src/lib/security-log.ts).
// In their own file so the open PRs that add to errors.test.ts merge cleanly.
// Error shapes are as PostgREST and Supabase Auth send them (errors.test.ts).

describe("databaseErrorReason", () => {
  it("names a raised error by its raise", () => {
    expect(databaseErrorReason({ code: "P0001", message: "session_full" })).toBe("session_full");
    expect(databaseErrorReason({ code: "P0001", message: "starts_in_past" })).toBe("starts_in_past");
  });

  it("names a CHECK by its constraint, not by Postgres's text", () => {
    const reason = databaseErrorReason({
      code: "23514",
      message: 'new row for relation "sessions" violates check constraint "sessions_capacity_min"',
      details: "Failing row contains (secret topic, …).",
    });
    expect(reason).toBe("sessions_capacity_min");
  });

  it("falls back to the SQLSTATE or PostgREST code, lower-cased", () => {
    expect(databaseErrorReason({ code: "42501", message: "permission denied for table sessions" })).toBe(
      "sqlstate_42501",
    );
    expect(
      databaseErrorReason({
        code: "23503",
        message: 'insert or update on table "sessions" violates foreign key constraint "x"',
      }),
    ).toBe("sqlstate_23503");
    expect(databaseErrorReason({ code: "PGRST116", message: "JSON object requested" })).toBe("sqlstate_pgrst116");
  });

  it("says unmapped for an error with nothing to name it by, and none for no error", () => {
    expect(databaseErrorReason({ message: "fetch failed" })).toBe("unmapped");
    expect(databaseErrorReason({ code: "not a code!", message: "x" })).toBe("unmapped");
    expect(databaseErrorReason(null)).toBe("none");
    expect(databaseErrorReason(undefined)).toBe("none");
  });

  it("agrees with databaseErrorMessage(): a named reason exactly when the student gets a specific message", () => {
    const mapped: DatabaseErrorLike[] = [
      { message: "already_joined" },
      { message: "host_cannot_leave" },
      { code: "23514", message: 'violates check constraint "courses_number_normalised"' },
      { code: "42501", message: "permission denied" },
    ];
    for (const error of mapped) {
      expect(databaseErrorMessage(error), JSON.stringify(error)).not.toBe(GENERIC_ERROR_MESSAGE);
      expect(databaseErrorReason(error)).not.toMatch(/^(none|unmapped)$/);
    }
    for (const error of [{ message: "fetch failed" }, null]) {
      expect(databaseErrorMessage(error)).toBe(GENERIC_ERROR_MESSAGE);
      expect(databaseErrorReason(error)).toMatch(/^(none|unmapped)$/);
    }
  });
});

describe("authErrorReason", () => {
  it("is the AuthError's code", () => {
    expect(
      authErrorReason({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }),
    ).toBe("invalid_credentials");
    expect(authErrorReason({ code: "otp_expired", status: 403, message: "Token has expired or is invalid" })).toBe(
      "otp_expired",
    );
  });

  it("is the HTTP status when there is no usable code, and never the message", () => {
    expect(authErrorReason({ status: 400, message: "Invalid login credentials" })).toBe("http_400");
    expect(authErrorReason({ code: "Not A Code", status: 429, message: "slow down" })).toBe("http_429");
    expect(authErrorReason({ message: "network down" })).toBe("unmapped");
  });

  it("says no_user when Supabase sent neither an error nor a user", () => {
    expect(authErrorReason(null)).toBe("no_user");
  });
});
