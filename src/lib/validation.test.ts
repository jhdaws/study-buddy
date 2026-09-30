import { describe, expect, it } from "vitest";

import { createSessionSchema, fieldErrors, MIN_CAPACITY } from "./validation";

// A fixed "now" so the past-start-time rule is deterministic.
const NOW = new Date("2026-09-29T12:00:00.000Z");

function valid(overrides: Record<string, unknown> = {}) {
  return {
    departmentCode: "CS",
    courseNumber: "4278",
    topic: "Sprint 2 architecture review",
    locationId: "featheringill-hall",
    room: "134",
    startsAt: "2026-09-29T14:00:00.000Z",
    endsAt: "2026-09-29T16:00:00.000Z",
    capacity: 4,
    ...overrides,
  };
}

/** The first error message for one field, or undefined if that field passed. */
function errorFor(field: string, overrides: Record<string, unknown>) {
  const result = createSessionSchema(NOW).safeParse(valid(overrides));
  if (result.success) return undefined;
  return fieldErrors(result.error)[field as never];
}

describe("createSessionSchema", () => {
  it("accepts a well-formed session", () => {
    const result = createSessionSchema(NOW).safeParse(valid());

    expect(result.success).toBe(true);
  });

  it("accepts a session with no room — a library table has no room number", () => {
    const result = createSessionSchema(NOW).safeParse(valid({ room: "" }));

    expect(result.success).toBe(true);
  });

  describe("required fields", () => {
    it.each([
      ["departmentCode", "Pick a department."],
      ["courseNumber", "Pick a course number."],
      ["locationId", "Pick a place to meet."],
    ])("rejects a missing %s", (field, message) => {
      expect(errorFor(field, { [field]: "" })).toBe(message);
    });

    it("rejects a topic that says nothing", () => {
      expect(errorFor("topic", { topic: "hi" })).toMatch(/what you are studying/);
    });
  });

  describe("time range", () => {
    it("rejects a start time that has already passed", () => {
      expect(
        errorFor("startsAt", { startsAt: "2026-09-29T09:00:00.000Z" }),
      ).toBe("That start time has already passed.");
    });

    it("allows a start time a few seconds old, so submitting 'now' works", () => {
      const justNow = new Date(NOW.getTime() - 5_000).toISOString();
      const result = createSessionSchema(NOW).safeParse(
        valid({ startsAt: justNow }),
      );

      expect(result.success).toBe(true);
    });

    it("rejects an end time before the start", () => {
      expect(
        errorFor("endsAt", { endsAt: "2026-09-29T13:00:00.000Z" }),
      ).toBe("The session has to end after it starts.");
    });

    it("rejects a zero-length session", () => {
      expect(
        errorFor("endsAt", { endsAt: valid().startsAt }),
      ).toBe("The session has to end after it starts.");
    });

    it("reports the parse failure, not the comparison, on an unparsable date", () => {
      expect(errorFor("startsAt", { startsAt: "not a date" })).toMatch(
        /not a valid date/,
      );
    });
  });

  describe("capacity", () => {
    it(`rejects a capacity below ${MIN_CAPACITY} — the host is one of them`, () => {
      expect(errorFor("capacity", { capacity: 1 })).toMatch(/at least 2/);
    });

    it("rejects a fractional capacity", () => {
      expect(errorFor("capacity", { capacity: 2.5 })).toMatch(/whole number/);
    });

    it("coerces the string a form submits", () => {
      const result = createSessionSchema(NOW).safeParse(valid({ capacity: "6" }));

      expect(result.success).toBe(true);
      expect(result.success && result.data.capacity).toBe(6);
    });

    it("has no maximum — the host decides (C0)", () => {
      const result = createSessionSchema(NOW).safeParse(
        valid({ capacity: 500 }),
      );

      expect(result.success).toBe(true);
    });
  });
});

describe("fieldErrors", () => {
  it("reports every failing field at once", () => {
    const result = createSessionSchema(NOW).safeParse(
      valid({ departmentCode: "", topic: "", capacity: 1 }),
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(Object.keys(fieldErrors(result.error)).sort()).toEqual([
      "capacity",
      "departmentCode",
      "topic",
    ]);
  });

  it("keeps only the first message for a field", () => {
    const result = createSessionSchema(NOW).safeParse(valid({ topic: "" }));

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(typeof fieldErrors(result.error).topic).toBe("string");
  });
});
