import { describe, expect, it } from "vitest";

import { endsHint, formatLength, isoToWhen, nextDays, suggestedStart, whenToIso } from "./when-picker";

// Tue 20 Oct 2026, 6:00 PM in Nashville (CDT, UTC-5).
const now = new Date("2026-10-20T23:00:00Z");

describe("nextDays", () => {
  it("is today and the next six campus days", () => {
    const days = nextDays(now);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-20", label: "Today", day: "20" });
    expect(days[1]).toEqual({ date: "2026-10-21", label: "Wed", day: "21" });
    expect(days[6].date).toBe("2026-10-26");
  });

  it("uses the campus date, not UTC's, late in the evening", () => {
    // 11:30 PM in Nashville is already the next day in UTC.
    expect(nextDays(new Date("2026-10-21T04:30:00Z"))[0].date).toBe("2026-10-20");
  });

  it("steps over the November clock change without skipping a day", () => {
    const days = nextDays(new Date("2026-10-30T17:00:00Z"), 4).map((d) => d.date);
    expect(days).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
});

describe("whenToIso and back", () => {
  it("turns a day, a time and a length into the two instants the form submits", () => {
    expect(whenToIso("2026-10-22", "19:00", 120)).toEqual({
      startsAt: "2026-10-23T00:00:00.000Z",
      endsAt: "2026-10-23T02:00:00.000Z",
    });
  });

  it("is empty while anything is missing", () => {
    expect(whenToIso("", "19:00", 120)).toEqual({ startsAt: "", endsAt: "" });
    expect(whenToIso("2026-10-22", "", 120)).toEqual({ startsAt: "", endsAt: "" });
  });

  it("reads a failed submit's instants back into picks", () => {
    expect(isoToWhen("2026-10-23T00:00:00.000Z", "2026-10-23T01:30:00.000Z")).toEqual({
      date: "2026-10-22",
      time: "19:00",
      minutes: 90,
    });
    expect(isoToWhen(undefined, undefined)).toEqual({ date: "", time: "", minutes: 120 });
  });
});

describe("labels", () => {
  it("formats lengths and the end time", () => {
    expect(formatLength(90)).toBe("1.5 h");
    expect(formatLength(120)).toBe("2 h");
    expect(endsHint("2026-10-22", "19:00", 120)).toBe("Ends 9:00 PM");
    expect(endsHint("", "19:00", 120)).toBe("");
  });

  it("suggests the next half hour with some lead time", () => {
    expect(suggestedStart(now)).toBe("19:00"); // 6:00 + 45 min = 6:45 -> 7:00
    expect(suggestedStart(new Date("2026-10-20T23:10:00Z"))).toBe("19:00"); // 6:55 -> 7:00
    expect(suggestedStart(new Date("2026-10-20T22:30:00Z"))).toBe("18:30"); // 6:15 -> 6:30
  });
});
