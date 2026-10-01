import { describe, expect, it } from "vitest";

import { mapDatabaseError } from "./errors";

// mapDatabaseError's inputs mirror what a Supabase RPC call's `error` looks
// like for each way create_session / get_or_create_course can fail
// (supabase/migrations/20261001031738 and ...031739). These are reproduced by
// hand -- not exercised against a live database -- because they are exactly
// the paths that are awkward to trigger for real (see the file's own
// comment).

describe("mapDatabaseError", () => {
  it.each([
    ["not_signed_in", "You've been signed out. Sign in again and try."],
    ["display_name_required", "Add a display name before hosting a session."],
    ["starts_in_past", "That start time has already passed."],
    ["department_required", "Choose or add a department."],
    ["invalid_course_number", "Enter a 4-digit course number, like 3251 or 2100W."],
  ])("maps the raised message %j", (message, expected) => {
    expect(mapDatabaseError({ message, code: "P0001" })).toBe(expected);
  });

  it.each([
    ["sessions_ends_after_starts", "The session has to end after it starts."],
    ["sessions_capacity_min", "Capacity must be at least 2 — you count as one."],
    ["departments_code_normalised", "That department code isn't valid."],
    [
      "courses_number_normalised",
      "Enter a 4-digit course number, like 3251 or 2100W.",
    ],
  ])("maps a check_violation naming %j", (constraint, expected) => {
    expect(
      mapDatabaseError({
        code: "23514",
        message: `new row for relation "sessions" violates check constraint "${constraint}"`,
      }),
    ).toBe(expected);
  });

  it("falls back to a generic message for an unrecognised error", () => {
    expect(
      mapDatabaseError({ code: "23503", message: "insert or update on table violates foreign key constraint" }),
    ).toBe("Something went wrong saving that. Try again.");
  });

  it("falls back for a check_violation on a constraint it does not know", () => {
    expect(
      mapDatabaseError({
        code: "23514",
        message: 'violates check constraint "some_future_constraint"',
      }),
    ).toBe("Something went wrong saving that. Try again.");
  });

  it("never surfaces raw Postgres text", () => {
    const message = mapDatabaseError({
      code: "42883",
      message: 'function public.create_session(uuid) does not exist',
    });
    expect(message).not.toContain("function");
    expect(message).not.toContain("public.");
  });
});
