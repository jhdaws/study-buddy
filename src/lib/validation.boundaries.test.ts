import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  LOCATION_LABEL_MAX_LENGTH,
  MAX_CAPACITY,
  ROOM_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
  createSessionSchema,
} from "./validation";

// Boundary-value tests for createSessionSchema (US-02), from the equivalence
// partitions in TEST_PLAN.md ("EP and BVA: createSessionSchema"). Each test
// sits on the edge of one partition: the last value accepted and the first
// one refused. validation.test.ts already covers the time rules and the
// lower capacity bound; these are the edges it did not. Kept in their own
// file so they merge cleanly alongside open PRs that edit validation.test.ts.

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

function parse(overrides: Record<string, string>) {
  return createSessionSchema(NOW).safeParse(validSession(overrides));
}

function fieldErrors<T>(result: z.ZodSafeParseResult<T>) {
  expect(result.success).toBe(false);
  return result.success ? {} : (z.flattenError(result.error).fieldErrors as Record<string, string[]>);
}

describe("createSessionSchema boundaries (US-02)", () => {
  describe(`topic: 1 to ${TOPIC_MAX_LENGTH} characters after trimming`, () => {
    it("rejects a topic of only spaces, as blank", () => {
      expect(fieldErrors(parse({ topic: "   " })).topic).toEqual(["Say what you'll be studying."]);
    });

    it("accepts a single character", () => {
      expect(parse({ topic: "x" }).success).toBe(true);
    });

    it(`accepts exactly ${TOPIC_MAX_LENGTH}, and rejects ${TOPIC_MAX_LENGTH + 1}`, () => {
      expect(parse({ topic: "x".repeat(TOPIC_MAX_LENGTH) }).success).toBe(true);
      expect(fieldErrors(parse({ topic: "x".repeat(TOPIC_MAX_LENGTH + 1) })).topic).toEqual([
        `Keep the topic to ${TOPIC_MAX_LENGTH} characters or fewer.`,
      ]);
    });

    it(`counts after trimming: ${TOPIC_MAX_LENGTH} characters plus surrounding spaces passes`, () => {
      const result = parse({ topic: `  ${"x".repeat(TOPIC_MAX_LENGTH)}  ` });
      expect(result.success && result.data.topic).toHaveLength(TOPIC_MAX_LENGTH);
    });
  });

  describe(`room: optional, at most ${ROOM_MAX_LENGTH} characters`, () => {
    it(`accepts exactly ${ROOM_MAX_LENGTH}, and rejects ${ROOM_MAX_LENGTH + 1}`, () => {
      expect(parse({ room: "r".repeat(ROOM_MAX_LENGTH) }).success).toBe(true);
      expect(fieldErrors(parse({ room: "r".repeat(ROOM_MAX_LENGTH + 1) })).room).toEqual([
        `Keep the room to ${ROOM_MAX_LENGTH} characters or fewer.`,
      ]);
    });
  });

  describe(`location label: 1 to ${LOCATION_LABEL_MAX_LENGTH} characters after trimming`, () => {
    it("rejects a blank label", () => {
      expect(fieldErrors(parse({ locationLabel: "  " })).locationLabel).toEqual([
        "Give the location a name.",
      ]);
    });

    it(`accepts exactly ${LOCATION_LABEL_MAX_LENGTH}, and rejects ${LOCATION_LABEL_MAX_LENGTH + 1}`, () => {
      expect(parse({ locationLabel: "L".repeat(LOCATION_LABEL_MAX_LENGTH) }).success).toBe(true);
      expect(
        fieldErrors(parse({ locationLabel: "L".repeat(LOCATION_LABEL_MAX_LENGTH + 1) })).locationLabel,
      ).toEqual([`Keep the location name to ${LOCATION_LABEL_MAX_LENGTH} characters or fewer.`]);
    });
  });

  describe("end strictly after start", () => {
    it("accepts an end one minute after the start -- the smallest gap the form's inputs can send", () => {
      expect(parse({ startsAt: iso(HOUR), endsAt: iso(HOUR + MINUTE) }).success).toBe(true);
    });
  });

  describe("capacity: a whole number from 2 to the top of Postgres's integer range", () => {
    it(`accepts exactly ${MAX_CAPACITY}, the largest value the database can store`, () => {
      const result = parse({ capacity: String(MAX_CAPACITY) });
      expect(result.success && result.data.capacity).toBe(MAX_CAPACITY);
    });
  });
});
