import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionSchema } from "./validation";
import { isoToLocalInput, localInputToIso } from "./datetime-local";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("localInputToIso", () => {
  it("reads the value in the runtime's own zone -- the browser's, in the form", () => {
    vi.stubEnv("TZ", "America/Chicago");
    expect(localInputToIso("2026-10-01T14:30")).toBe("2026-10-01T19:30:00.000Z");

    vi.stubEnv("TZ", "America/Los_Angeles");
    expect(localInputToIso("2026-10-01T14:30")).toBe("2026-10-01T21:30:00.000Z");
  });

  it("produces what createSessionSchema accepts, where the raw value is rejected", () => {
    const now = new Date("2026-10-01T12:00:00Z");
    const base = {
      departmentCode: "CS",
      courseNumber: "3251",
      topic: "Design patterns",
      placeId: "ChIJ-FAKE-featheringill-hall",
      locationLabel: "Featheringill Hall",
      capacity: "4",
    };

    const raw = createSessionSchema(now).safeParse({
      ...base,
      startsAt: "2026-10-01T14:30",
      endsAt: "2026-10-01T16:30",
    });
    expect(raw.success).toBe(false);

    const converted = createSessionSchema(now).safeParse({
      ...base,
      startsAt: localInputToIso("2026-10-01T14:30"),
      endsAt: localInputToIso("2026-10-01T16:30"),
    });
    expect(converted.success).toBe(true);
  });

  it("accepts seconds, which some browsers include", () => {
    vi.stubEnv("TZ", "UTC");
    expect(localInputToIso("2026-10-01T14:30:15")).toBe("2026-10-01T14:30:15.000Z");
  });

  it("returns an empty string for blank, partial or impossible values", () => {
    expect(localInputToIso("")).toBe("");
    expect(localInputToIso("2026-10-01")).toBe("");
    expect(localInputToIso("not a date")).toBe("");
    expect(localInputToIso("2026-02-30T10:00")).toBe("");
  });
});

describe("isoToLocalInput", () => {
  it("is the inverse of localInputToIso, to the minute", () => {
    for (const zone of ["UTC", "America/Chicago", "Asia/Kolkata"]) {
      vi.stubEnv("TZ", zone);
      expect(isoToLocalInput(localInputToIso("2026-10-01T09:05"))).toBe("2026-10-01T09:05");
    }
  });

  it("shows an instant in the runtime's zone", () => {
    vi.stubEnv("TZ", "America/Chicago");
    expect(isoToLocalInput("2026-10-01T19:30:00.000Z")).toBe("2026-10-01T14:30");
  });

  it("returns an empty string for nothing or garbage", () => {
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput("soon")).toBe("");
  });
});
