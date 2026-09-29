import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionSchema } from "./validation";
import { isoToLocalInput, localInputToIso } from "./datetime-local";

afterEach(() => {
  vi.unstubAllEnvs();
});

// The machine running the code must not matter: the form reads and shows
// campus time (America/Chicago) wherever the student's device thinks it is.
const RUNTIME_ZONES = ["UTC", "America/Chicago", "America/Los_Angeles", "Asia/Tokyo"];

describe("localInputToIso", () => {
  it("reads the value as campus time, whatever the runtime's zone", () => {
    for (const zone of RUNTIME_ZONES) {
      vi.stubEnv("TZ", zone);
      // October: Central Daylight Time, UTC-5.
      expect(localInputToIso("2026-10-01T14:30")).toBe("2026-10-01T19:30:00.000Z");
      // December: Central Standard Time, UTC-6.
      expect(localInputToIso("2026-12-01T14:30")).toBe("2026-12-01T20:30:00.000Z");
    }
  });

  it("handles the daylight-saving changes", () => {
    vi.stubEnv("TZ", "UTC");
    // Spring forward, 2026-03-08 02:00 CST -> 03:00 CDT.
    expect(localInputToIso("2026-03-08T01:30")).toBe("2026-03-08T07:30:00.000Z");
    // 2:30 AM does not exist that night: an hour later, as browsers do.
    expect(localInputToIso("2026-03-08T02:30")).toBe("2026-03-08T08:30:00.000Z");
    expect(localInputToIso("2026-03-08T03:00")).toBe("2026-03-08T08:00:00.000Z");
    // Fall back, 2026-11-01 02:00 CDT -> 01:00 CST.
    expect(localInputToIso("2026-11-01T00:30")).toBe("2026-11-01T05:30:00.000Z");
    // 1:30 AM happens twice that night: the first one.
    expect(localInputToIso("2026-11-01T01:30")).toBe("2026-11-01T06:30:00.000Z");
    expect(localInputToIso("2026-11-01T02:00")).toBe("2026-11-01T08:00:00.000Z");
    expect(localInputToIso("2026-11-01T03:00")).toBe("2026-11-01T09:00:00.000Z");
  });

  it("takes an explicit zone", () => {
    expect(localInputToIso("2026-10-01T14:30", "UTC")).toBe("2026-10-01T14:30:00.000Z");
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
    expect(localInputToIso("2026-10-01T14:30:15")).toBe("2026-10-01T19:30:15.000Z");
  });

  it("returns an empty string for blank, partial or impossible values", () => {
    for (const value of [
      "",
      "2026-10-01",
      "not a date",
      "2026-02-30T10:00",
      "2026-10-01T24:00",
      "2026-10-01T10:60",
    ]) {
      expect(localInputToIso(value)).toBe("");
    }
  });
});

describe("isoToLocalInput", () => {
  it("shows an instant as campus time, whatever the runtime's zone", () => {
    for (const zone of RUNTIME_ZONES) {
      vi.stubEnv("TZ", zone);
      expect(isoToLocalInput("2026-10-01T19:30:00.000Z")).toBe("2026-10-01T14:30");
      expect(isoToLocalInput("2027-01-01T05:59:00.000Z")).toBe("2026-12-31T23:59");
    }
  });

  it("is the inverse of localInputToIso, to the minute", () => {
    for (const local of ["2026-10-01T09:05", "2026-12-01T23:45", "2026-11-01T03:00"]) {
      expect(isoToLocalInput(localInputToIso(local))).toBe(local);
    }
  });

  it("returns an empty string for nothing or garbage", () => {
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("")).toBe("");
    expect(isoToLocalInput("soon")).toBe("");
  });
});
