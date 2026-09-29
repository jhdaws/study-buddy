import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatCampusDay,
  formatCourseCode,
  formatSeatsLeft,
  formatSessionCount,
  formatSessionTime,
  isInProgress,
} from "./format";

// Intl puts thin and narrow no-break spaces around the dash and before
// AM/PM, and the exact characters vary between ICU versions. Compare with
// plain spaces.
const plain = (text: string) => text.replace(/\s+/g, " ");

// 1 Oct 2026 is a Thursday, in daylight time (CDT, UTC-5). US daylight time
// ends on Sunday 1 Nov 2026 (CST, UTC-6).
const now = new Date("2026-10-01T15:00:00Z"); // Thu 10:00 AM in Nashville

describe("formatSessionTime shows campus time whatever the runtime's zone", () => {
  // The server on Vercel runs in UTC; a laptop may be anywhere. The module is
  // re-imported under each zone, because Intl.DateTimeFormat fixes its zone
  // when it is constructed -- so a formatter that forgot `timeZone` would
  // take on the stubbed zone and fail here.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  for (const zone of ["UTC", "America/Chicago", "Asia/Tokyo"]) {
    it(`prints Nashville times with TZ=${zone}`, async () => {
      vi.stubEnv("TZ", zone);
      vi.resetModules();
      const format = await import("./format");

      expect(
        plain(format.formatSessionTime("2026-10-01T19:00:00.000Z", "2026-10-01T21:00:00.000Z", now)),
      ).toBe("Today · 2:00 – 4:00 PM");

      // 10 PM Thursday in Nashville is already Friday in UTC, and Friday
      // afternoon in Tokyo: still "Today" on campus.
      const lateEvening = new Date("2026-10-02T03:00:00Z");
      expect(
        plain(
          format.formatSessionTime("2026-10-02T04:30:00.000Z", "2026-10-02T04:55:00.000Z", lateEvening),
        ),
      ).toBe("Today · 11:30 – 11:55 PM");
    });
  }
});

describe("formatSessionTime", () => {
  it("says Tomorrow for the next campus day", () => {
    expect(
      plain(formatSessionTime("2026-10-02T14:00:00.000Z", "2026-10-02T16:00:00.000Z", now)),
    ).toBe("Tomorrow · 9:00 – 11:00 AM");
  });

  it("gives the weekday and date further out", () => {
    expect(
      plain(formatSessionTime("2026-10-05T23:30:00.000Z", "2026-10-06T01:00:00.000Z", now)),
    ).toBe("Mon, Oct 5 · 6:30 – 8:00 PM");
  });

  it("shows both days when a session runs past midnight", () => {
    expect(
      plain(formatSessionTime("2026-10-02T04:00:00.000Z", "2026-10-02T06:00:00.000Z", now)),
    ).toBe("Today, 11:00 PM – Tomorrow, 1:00 AM");
  });

  it("follows the switch to standard time", () => {
    // 20:00 UTC is 3 PM in daylight time but 2 PM once the clocks go back.
    const saturday = new Date("2026-10-31T17:00:00Z");
    expect(
      plain(formatSessionTime("2026-11-01T20:00:00.000Z", "2026-11-01T22:00:00.000Z", saturday)),
    ).toBe("Tomorrow · 2:00 – 4:00 PM");
  });
});

describe("formatCampusDay", () => {
  it("labels yesterday, for a session still running from last night", () => {
    expect(formatCampusDay(new Date("2026-10-01T03:00:00Z"), now)).toBe("Yesterday");
  });
});

describe("isInProgress", () => {
  const start = "2026-10-01T15:00:00.000Z";
  const end = "2026-10-01T17:00:00.000Z";

  it("is true from the start up to, not including, the end", () => {
    expect(isInProgress(start, end, new Date("2026-10-01T14:59:59Z"))).toBe(false);
    expect(isInProgress(start, end, new Date(start))).toBe(true);
    expect(isInProgress(start, end, new Date("2026-10-01T16:59:59Z"))).toBe(true);
    expect(isInProgress(start, end, new Date(end))).toBe(false);
  });
});

describe("small formatters", () => {
  it("formats seats left, with 0 as Full", () => {
    expect(formatSeatsLeft(0)).toBe("Full");
    expect(formatSeatsLeft(1)).toBe("1 seat left");
    expect(formatSeatsLeft(3)).toBe("3 seats left");
  });

  it("formats how often a course has been used", () => {
    expect(formatSessionCount(0)).toBe("No sessions yet");
    expect(formatSessionCount(1)).toBe("1 session");
    expect(formatSessionCount(12)).toBe("12 sessions");
  });

  it("formats a course code, letter suffix included", () => {
    expect(formatCourseCode({ departmentCode: "CHEM", number: "1601L" })).toBe("CHEM 1601L");
  });
});
