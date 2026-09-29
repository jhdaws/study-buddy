import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  DISPLAY_NAME_MAX_LENGTH,
  MIN_CAPACITY,
  START_GRACE_MINUTES,
  createSessionSchema,
  displayNameSchema,
  invalidFormState,
  signInSchema,
} from "./validation";

// A fixed clock for every time rule, so the tests do not depend on when they
// run.
const NOW = new Date("2026-10-01T15:00:00.000Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

/** A submission that passes, as the form would post it: every value a string. */
function validSession(overrides: Record<string, string> = {}) {
  return {
    departmentCode: "CS",
    courseNumber: "3251",
    topic: "Design patterns review",
    room: "Room 100",
    placeId: "ChIJ-FAKE-featheringill-hall",
    locationLabel: "Featheringill Hall",
    startsAt: iso(1 * HOUR),
    endsAt: iso(3 * HOUR),
    capacity: "4",
    ...overrides,
  };
}

function fieldErrors<T>(result: z.ZodSafeParseResult<T>) {
  expect(result.success).toBe(false);
  return result.success ? {} : (z.flattenError(result.error).fieldErrors as Record<string, string[]>);
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe("signInSchema (US-01)", () => {
  it("accepts a Vanderbilt address, trimmed and lowercased", () => {
    const result = signInSchema.safeParse({ email: "  Jane.Doe@Vanderbilt.EDU " });
    expect(result).toEqual({ success: true, data: { email: "jane.doe@vanderbilt.edu" } });
  });

  it.each([
    ["another domain", "jane@gmail.com"],
    ["a subdomain", "jane@mail.vanderbilt.edu"],
    ["a lookalike domain", "jane@notvanderbilt.edu"],
    ["the domain as the local part", "vanderbilt.edu@gmail.com"],
  ])("rejects %s with the domain message", (_case, email) => {
    expect(fieldErrors(signInSchema.safeParse({ email })).email).toEqual([
      "Use your @vanderbilt.edu email address.",
    ]);
  });

  it("gives one message for a malformed address, not the domain one too", () => {
    expect(fieldErrors(signInSchema.safeParse({ email: "not-an-email" })).email).toEqual([
      "Enter a valid email address.",
    ]);
  });

  it("asks for an address when the field is blank or missing", () => {
    expect(fieldErrors(signInSchema.safeParse({ email: "   " })).email?.[0]).toBe(
      "Enter your Vanderbilt email address.",
    );
    expect(fieldErrors(signInSchema.safeParse({})).email?.[0]).toBe(
      "Enter your Vanderbilt email address.",
    );
  });
});

// ---------------------------------------------------------------------------

describe("displayNameSchema (US-01, ADR 0008 rule 1)", () => {
  it("accepts a name, trimmed", () => {
    expect(displayNameSchema.safeParse({ displayName: "  Priya  " })).toEqual({
      success: true,
      data: { displayName: "Priya" },
    });
  });

  it("rejects a blank name", () => {
    expect(fieldErrors(displayNameSchema.safeParse({ displayName: "   " })).displayName).toEqual([
      "Enter a display name.",
    ]);
  });

  it(`rejects a name longer than ${DISPLAY_NAME_MAX_LENGTH} characters`, () => {
    expect(
      displayNameSchema.safeParse({ displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
    expect(
      fieldErrors(displayNameSchema.safeParse({ displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1) }))
        .displayName,
    ).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

describe("createSessionSchema (US-02)", () => {
  it("accepts a valid session and converts it for the database", () => {
    const result = createSessionSchema(NOW).safeParse(
      validSession({ topic: "  Design patterns review  " }),
    );
    expect(result).toEqual({
      success: true,
      data: {
        departmentCode: "CS",
        courseNumber: "3251",
        topic: "Design patterns review",
        room: "Room 100",
        placeId: "ChIJ-FAKE-featheringill-hall",
        locationLabel: "Featheringill Hall",
        startsAt: new Date(NOW.getTime() + 1 * HOUR),
        endsAt: new Date(NOW.getTime() + 3 * HOUR),
        capacity: 4,
      },
    });
  });

  it("treats a blank or missing room as none", () => {
    const blank = createSessionSchema(NOW).safeParse(validSession({ room: "  " }));
    expect(blank.success && blank.data.room).toBeNull();

    const withoutRoom: Record<string, string> = validSession();
    delete withoutRoom.room;
    const missing = createSessionSchema(NOW).safeParse(withoutRoom);
    expect(missing.success && missing.data.room).toBeNull();
  });

  it("accepts a time with a UTC offset, not only Z", () => {
    const result = createSessionSchema(NOW).safeParse(
      validSession({ startsAt: "2026-10-01T11:00:00-05:00", endsAt: "2026-10-01T13:00:00-05:00" }),
    );
    expect(result.success && result.data.startsAt).toEqual(new Date("2026-10-01T16:00:00Z"));
  });

  it("rejects a bare datetime-local value, which has no time zone", () => {
    const errors = fieldErrors(
      createSessionSchema(NOW).safeParse(validSession({ startsAt: "2026-10-01T16:00" })),
    );
    expect(errors.startsAt).toEqual(["Choose a start time."]);
  });

  describe("US-02b: impossible times are blocked with a field-level error", () => {
    it("rejects an end before the start, on endsAt", () => {
      const errors = fieldErrors(
        createSessionSchema(NOW).safeParse(validSession({ startsAt: iso(3 * HOUR), endsAt: iso(2 * HOUR) })),
      );
      expect(errors).toEqual({ endsAt: ["The end time must be after the start time."] });
    });

    it("rejects an end equal to the start", () => {
      const errors = fieldErrors(
        createSessionSchema(NOW).safeParse(validSession({ startsAt: iso(HOUR), endsAt: iso(HOUR) })),
      );
      expect(errors.endsAt).toEqual(["The end time must be after the start time."]);
    });

    it("rejects a start in the past, on startsAt", () => {
      const errors = fieldErrors(
        createSessionSchema(NOW).safeParse(validSession({ startsAt: iso(-HOUR), endsAt: iso(HOUR) })),
      );
      expect(errors).toEqual({ startsAt: ["The start time has already passed."] });
    });

    it(`allows a start up to ${START_GRACE_MINUTES} minutes ago, and no more`, () => {
      const schema = createSessionSchema(NOW);
      const grace = START_GRACE_MINUTES * MINUTE;
      expect(schema.safeParse(validSession({ startsAt: iso(-grace) })).success).toBe(true);
      expect(fieldErrors(schema.safeParse(validSession({ startsAt: iso(-grace - 1000) }))).startsAt).toEqual([
        "The start time has already passed.",
      ]);
    });

    it("reports a past start and an end before it together", () => {
      const errors = fieldErrors(
        createSessionSchema(NOW).safeParse(validSession({ startsAt: iso(-HOUR), endsAt: iso(-2 * HOUR) })),
      );
      expect(errors.startsAt).toEqual(["The start time has already passed."]);
      expect(errors.endsAt).toEqual(["The end time must be after the start time."]);
    });

    it("reports the end-before-start error alongside errors in other fields", () => {
      const errors = fieldErrors(
        createSessionSchema(NOW).safeParse(
          validSession({ topic: "", startsAt: iso(3 * HOUR), endsAt: iso(2 * HOUR) }),
        ),
      );
      expect(errors.topic).toBeDefined();
      expect(errors.endsAt).toEqual(["The end time must be after the start time."]);
    });

    it("reads the clock per call when no time is injected", () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const schema = createSessionSchema();
      expect(schema.safeParse(validSession({ startsAt: iso(-HOUR) })).success).toBe(false);
      expect(schema.safeParse(validSession()).success).toBe(true);
    });
  });

  describe("capacity (ADR 0008 rule 2: at least 2, the host counts)", () => {
    it("rejects fewer than two", () => {
      for (const capacity of ["1", "0", "-3"]) {
        expect(
          fieldErrors(createSessionSchema(NOW).safeParse(validSession({ capacity }))).capacity,
        ).toEqual([`At least ${MIN_CAPACITY} — you count as one.`]);
      }
    });

    it("accepts exactly two, and has no product maximum", () => {
      expect(createSessionSchema(NOW).safeParse(validSession({ capacity: "2" })).success).toBe(true);
      expect(createSessionSchema(NOW).safeParse(validSession({ capacity: "500" })).success).toBe(true);
    });

    it("rejects a blank, a non-number, and a fraction", () => {
      const message = (capacity: string) =>
        fieldErrors(createSessionSchema(NOW).safeParse(validSession({ capacity }))).capacity;
      expect(message("")).toEqual(["Enter how many people can come, including you."]);
      expect(message("lots")).toEqual(["Enter how many people can come, including you."]);
      expect(message("2.5")).toEqual(["Enter a whole number."]);
    });

    it("rejects a number too big for a Postgres integer", () => {
      expect(
        fieldErrors(createSessionSchema(NOW).safeParse(validSession({ capacity: "2147483648" }))).capacity,
      ).toHaveLength(1);
    });
  });

  it("reports every missing field on the first submit", () => {
    const errors = fieldErrors(createSessionSchema(NOW).safeParse({}));
    expect(Object.keys(errors).sort()).toEqual(
      [
        "capacity",
        "courseNumber",
        "departmentCode",
        "endsAt",
        "locationLabel",
        "placeId",
        "startsAt",
        "topic",
      ].sort(),
    );
  });
});

// ---------------------------------------------------------------------------

describe("invalidFormState", () => {
  it("returns field errors and the submitted values, without React's own entries", () => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(validSession({ capacity: "1" }))) {
      formData.set(key, value);
    }
    formData.set("$ACTION_ID_abc123", "");

    const result = createSessionSchema(NOW).safeParse(Object.fromEntries(formData));
    expect(result.success).toBe(false);
    if (result.success) return;

    const state = invalidFormState(result.error, formData);
    expect(state.fieldErrors).toEqual({ capacity: [`At least ${MIN_CAPACITY} — you count as one.`] });
    expect(state.formError).toBeUndefined();
    expect(state.values).toEqual(validSession({ capacity: "1" }));
  });
});
