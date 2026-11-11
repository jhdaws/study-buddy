import { describe, expect, it } from "vitest";

import {
  CODE_RATE_LIMITED_MESSAGE,
  CODE_REJECTED_MESSAGE,
  databaseErrorMessage,
  DELETE_ACCOUNT_FAILED_MESSAGE,
  deleteAccountErrorMessage,
  GENERIC_ERROR_MESSAGE,
  mapUnavailableMessage,
  PASSWORD_REJECTED_MESSAGE,
  passwordSignInErrorMessage,
  PLACE_SEARCH_BUSY_MESSAGE,
  PLACE_SEARCH_FAILED_MESSAGE,
  PLACE_SEARCH_OFFLINE_MESSAGE,
  placeSearchErrorMessage,
  setPasswordErrorMessage,
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

// What create_session and get_or_create_course can return (S1-S3). Shapes
// copied from what supabase.rpc() hands back: a raised exception arrives with
// its text in `message`; a CHECK violation names the constraint there.
describe("databaseErrorMessage: creating a session (S1-S3)", () => {
  it.each([
    ["not_signed_in", "You've been signed out. Sign in again and try."],
    ["display_name_required", "Add a display name before hosting a session."],
    ["starts_in_past", "That start time has already passed."],
    ["department_required", "Choose or add a department."],
    ["invalid_course_number", "Enter a 4-digit course number, like 3251 or 2100W."],
  ])("maps the raised message %j", (message, expected) => {
    expect(databaseErrorMessage({ message, code: "P0001" })).toBe(expected);
  });

  it.each([
    ["sessions_ends_after_starts", "The session has to end after it starts."],
    ["sessions_capacity_min", "Capacity must be at least 2 — you count as one."],
    ["sessions_topic_length", "Keep the topic to 1 to 120 characters."],
    ["sessions_location_label_length", "Keep the location name to 1 to 100 characters."],
    ["sessions_room_length", "Keep the room to 50 characters or fewer."],
    ["departments_code_normalised", "That department code isn't valid."],
    ["departments_code_length", "Department codes are at most 10 letters or digits."],
    ["courses_number_normalised", "Enter a 4-digit course number, like 3251 or 2100W."],
  ])("maps a check_violation naming %j", (constraint, expected) => {
    expect(
      databaseErrorMessage({
        code: "23514",
        message: `new row for relation "sessions" violates check constraint "${constraint}"`,
      }),
    ).toBe(expected);
  });

  it("only matches a raised name as the whole message", () => {
    expect(databaseErrorMessage({ message: "starts_in_past and more", code: "P0001" })).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    // Not an inherited property of the lookup table either.
    expect(databaseErrorMessage({ message: "constructor", code: "P0001" })).toBe(
      GENERIC_ERROR_MESSAGE,
    );
  });

  it("falls back for a foreign-key failure or an unknown constraint", () => {
    expect(
      databaseErrorMessage({
        code: "23503",
        message: 'insert or update on table "sessions" violates foreign key constraint "sessions_location_id_fkey"',
      }),
    ).toBe(GENERIC_ERROR_MESSAGE);
    expect(
      databaseErrorMessage({ code: "23514", message: 'violates check constraint "some_future_constraint"' }),
    ).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("never surfaces raw Postgres text", () => {
    const message = databaseErrorMessage({
      code: "42883",
      message: "function public.create_session(uuid) does not exist",
    });
    expect(message).not.toMatch(RAW_TEXT);
    expect(message).not.toContain("public.");
  });
});

// SEC-03: the catalogue trigger (*_catalogue_insert_limit.sql), as
// supabase.rpc("get_or_create_course") or a direct insert hands it back.
describe("databaseErrorMessage: the catalogue insert limit (SEC-03)", () => {
  const raised = {
    code: "PT429",
    message: "catalogue_limit_reached",
    details: "courses: 10 added in the last hour, 10 in the last day",
  };

  it("maps catalogue_limit_reached to the limit, in the student's words", () => {
    expect(databaseErrorMessage(raised)).toBe(
      "You've added a lot of new courses and departments lately — the limit is 10 of each an " +
        "hour and 30 a day. Choose one that's already listed, or try again later.",
    );
  });

  it("never shows the trigger's details, which name the table", () => {
    const message = databaseErrorMessage(raised);
    expect(message).not.toMatch(RAW_TEXT);
    expect(message).not.toMatch(/catalogue_limit_reached|added in the last|PT429/);
  });
});

// What join_session and leave_session can raise (S5).
describe("databaseErrorMessage: joining and leaving a session (S5)", () => {
  it.each([
    ["session_not_found", "That session doesn't exist anymore."],
    ["session_cancelled", "This session has been cancelled."],
    ["session_ended", "This session has already ended."],
    ["already_joined", "You're already on the roster for this session."],
    ["session_full", "This session is full."],
    ["not_joined", "You're not on the roster for this session."],
    ["host_cannot_leave", "As the host, you can't leave — cancel the session instead."],
    // P4 (US-22): the host has blocked the caller. Worded like any other
    // refusal on purpose -- never "blocked".
    ["cannot_join_session", "You can't join this session."],
    // S7 (US-09): update_session and cancel_session.
    ["not_session_host", "Only the host can change or cancel this session."],
    [
      "capacity_below_roster",
      "That's fewer seats than the students already coming. Nobody is removed by an edit.",
    ],
  ])("maps the raised message %j", (message, expected) => {
    expect(databaseErrorMessage({ message, code: "P0001" })).toBe(expected);
  });
});

describe("placeSearchErrorMessage (M2)", () => {
  it("says the search is busy when Google's quota answers 429", () => {
    expect(placeSearchErrorMessage({ status: 429 })).toBe(PLACE_SEARCH_BUSY_MESSAGE);
  });

  it.each([400, 403, 500, 503])("gives HTTP %i the general message", (status) => {
    expect(placeSearchErrorMessage({ status })).toBe(PLACE_SEARCH_FAILED_MESSAGE);
  });

  it("blames the connection when no answer came back at all", () => {
    expect(placeSearchErrorMessage(new TypeError("Failed to fetch"))).toBe(
      PLACE_SEARCH_OFFLINE_MESSAGE,
    );
    expect(placeSearchErrorMessage({ status: null })).toBe(PLACE_SEARCH_OFFLINE_MESSAGE);
    expect(placeSearchErrorMessage(null)).toBe(PLACE_SEARCH_OFFLINE_MESSAGE);
  });

  it("never mentions Google's own error text", () => {
    for (const message of [
      PLACE_SEARCH_BUSY_MESSAGE,
      PLACE_SEARCH_FAILED_MESSAGE,
      PLACE_SEARCH_OFFLINE_MESSAGE,
    ]) {
      expect(message).not.toMatch(/API|key|PERMISSION|referer|quota/i);
    }
  });
});

describe("databaseErrorMessage: the academic profile (US-11)", () => {
  it.each([
    ["profiles_major_check", /major/],
    ["profiles_minor_check", /minor/],
  ])("maps a violation of %s without raw text", (constraint, expected) => {
    const message = databaseErrorMessage({
      code: "23514",
      message: `new row for relation "profiles" violates check constraint "${constraint}"`,
    });
    expect(message).toMatch(expected);
    expect(message).not.toMatch(RAW_TEXT);
  });

  it("maps the profile_courses_limit trigger's refusal", () => {
    expect(databaseErrorMessage({ code: "P0001", message: "profile_courses_limit" })).toBe(
      "List up to 8 current courses.",
    );
  });
});

describe("databaseErrorMessage: reporting a user (US-18)", () => {
  it("maps the daily limit without the trigger's text", () => {
    const message = databaseErrorMessage({ code: "PT429", message: "report_limit_reached" });
    expect(message).toMatch(/5 reports in the last day/);
    expect(message).not.toMatch(RAW_TEXT);
  });

  it.each([
    ["reports_note_length", /500 characters/],
    ["reports_not_self", /can't report yourself/],
  ])("maps a violation of %s", (constraint, expected) => {
    const message = databaseErrorMessage({
      code: "23514",
      message: `new row for relation "reports" violates check constraint "${constraint}"`,
    });
    expect(message).toMatch(expected);
    expect(message).not.toMatch(RAW_TEXT);
  });
});

describe("databaseErrorMessage: blocking a user (US-22)", () => {
  it("maps a self-block", () => {
    const message = databaseErrorMessage({
      code: "23514",
      message: 'new row for relation "blocks" violates check constraint "blocks_not_self"',
    });
    expect(message).toBe("You can't block yourself.");
    expect(message).not.toMatch(RAW_TEXT);
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

describe("passwordSignInErrorMessage (A6)", () => {
  it("says the email and password don't match, whether or not the account exists", () => {
    expect(
      passwordSignInErrorMessage({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }),
    ).toBe(PASSWORD_REJECTED_MESSAGE);
    expect(passwordSignInErrorMessage({ status: 400, message: "Invalid login credentials" })).toBe(
      PASSWORD_REJECTED_MESSAGE,
    );
  });

  it("points an unfinished sign-up at the code", () => {
    expect(passwordSignInErrorMessage({ code: "email_not_confirmed", status: 400 })).toMatch(
      /get a code by email/,
    );
  });

  it("maps rate limits and anything unknown to our own text", () => {
    expect(passwordSignInErrorMessage({ status: 429 })).toBe(CODE_RATE_LIMITED_MESSAGE);
    expect(passwordSignInErrorMessage({ status: 500, message: "boom" })).toBe(GENERIC_ERROR_MESSAGE);
    expect(passwordSignInErrorMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});

describe("setPasswordErrorMessage (A6)", () => {
  it("explains Supabase's refusals in our words", () => {
    expect(setPasswordErrorMessage({ code: "weak_password", status: 422 })).toMatch(/stronger password/);
    expect(setPasswordErrorMessage({ code: "same_password", status: 422 })).toMatch(
      /already your password/,
    );
    expect(setPasswordErrorMessage({ code: "reauthentication_needed", status: 400 })).toMatch(
      /sign in again with a code/,
    );
  });

  it("maps rate limits and anything unknown to our own text", () => {
    expect(setPasswordErrorMessage({ status: 429 })).toBe(CODE_RATE_LIMITED_MESSAGE);
    expect(setPasswordErrorMessage({ status: 500, message: "boom" })).toBe(GENERIC_ERROR_MESSAGE);
    expect(setPasswordErrorMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });
});


describe("mapUnavailableMessage (M4)", () => {
  it("points every reason at the list, which always works", () => {
    for (const reason of ["not_configured", "load_failed"] as const) {
      expect(mapUnavailableMessage(reason)).toMatch(/list/);
    }
  });

  it("tells a load failure apart from a deployment without a map", () => {
    expect(mapUnavailableMessage("load_failed")).toMatch(/reload/);
    expect(mapUnavailableMessage("not_configured")).not.toMatch(/reload/);
  });

  it("never mentions keys, referrers or Google's error codes", () => {
    for (const reason of ["not_configured", "load_failed"] as const) {
      expect(mapUnavailableMessage(reason)).not.toMatch(/key|referr|billing|RefererNotAllowed|ApiNotActivated/i);
    }
  });
});

describe("databaseErrorMessage: study requests (R1, US-16)", () => {
  it("explains a second ask for the same course", () => {
    // study_requests is written through RLS policies, not a function, so a
    // refusal arrives as a constraint name rather than a raised message.
    const message = databaseErrorMessage({
      code: "23505",
      message:
        'duplicate key value violates unique constraint "study_requests_course_id_author_id_key"',
    });

    expect(message).toBe("You've already asked for this course. Classmates can see it.");
  });

  it("explains a note that is too long", () => {
    const message = databaseErrorMessage({
      code: "23514",
      message:
        'new row for relation "study_requests" violates check constraint "study_requests_note_length"',
    });

    expect(message).toBe("Keep your note to 200 characters or fewer.");
  });

  it("falls back to the permission message when a policy refuses the write", () => {
    // What a forged author_id looks like from PostgREST.
    const message = databaseErrorMessage({
      code: "42501",
      message: 'new row violates row-level security policy for table "study_requests"',
    });

    expect(message).toBe("You don't have permission to do that.");
  });
});
describe("deleteAccountErrorMessage (US-24)", () => {
  it("says nothing was deleted, without Supabase's text", () => {
    for (const error of [
      { status: 500, code: "unexpected_failure", message: "Database error deleting user" },
      { status: 403, code: "not_admin", message: "User not allowed" },
      null,
    ]) {
      expect(deleteAccountErrorMessage(error)).toBe(DELETE_ACCOUNT_FAILED_MESSAGE);
    }
  });

  it("asks a rate-limited student to wait", () => {
    expect(deleteAccountErrorMessage({ status: 429 })).toBe(CODE_RATE_LIMITED_MESSAGE);
    expect(deleteAccountErrorMessage({ code: "over_request_rate_limit" })).toBe(
      CODE_RATE_LIMITED_MESSAGE,
    );
  });
});

// SEC-05: consume_rate_limit() at the limit, as supabase.rpc() hands it back.
describe("databaseErrorMessage: the place lookup rate limit (SEC-05)", () => {
  it("maps place_lookup_rate_limited, and never shows the count in its details", () => {
    const message = databaseErrorMessage({
      code: "PT429",
      message: "place_lookup_rate_limited",
      details: "20 of 20 hits used in the last 00:10:00",
    });
    expect(message).toBe(
      "You've tried a lot of places in the last few minutes. Wait a few minutes, then try again.",
    );
    expect(message).not.toMatch(/rate_limited|hits|PT429/);
  });
});

describe("databaseErrorMessage: repeat weekly (S10, US-20)", () => {
  it("explains a week count outside 2..8", () => {
    expect(databaseErrorMessage({ message: "weeks_out_of_range", code: "P0001" })).toBe(
      "Repeat for between 2 and 8 weeks.",
    );
  });
});
