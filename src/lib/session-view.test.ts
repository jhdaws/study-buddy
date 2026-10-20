import { describe, expect, it } from "vitest";

import {
  avatarColour,
  avatarStack,
  boardColumn,
  cardTime,
  formatTimeRange,
  initialsOf,
  seatsText,
  sessionRelation,
  sessionStatus,
} from "./session-view";

// 2026-10-20 18:00 in Nashville (CDT, UTC-5).
const now = new Date("2026-10-20T23:00:00Z");
const at = (iso: string) => iso;

const base = {
  startsAt: at("2026-10-21T00:00:00Z"), // 7:00 PM
  endsAt: at("2026-10-21T02:00:00Z"), // 9:00 PM
  seatsLeft: 3,
  hostId: "host",
  going: [
    { userId: "host", displayName: "Priya Raman" },
    { userId: "me", displayName: "Moses" },
  ],
};

describe("sessionStatus", () => {
  it("is open with seats, full without, happening now while under way", () => {
    expect(sessionStatus(base, now)).toBe("open");
    expect(sessionStatus({ ...base, seatsLeft: 0 }, now)).toBe("full");
    expect(sessionStatus({ ...base, startsAt: at("2026-10-20T22:00:00Z") }, now)).toBe("now");
  });

  it("puts cancelled before ended, and ended before everything else", () => {
    expect(sessionStatus({ ...base, endsAt: at("2026-10-20T22:30:00Z") }, now)).toBe("ended");
    expect(sessionStatus({ ...base, status: "cancelled" }, now)).toBe("cancelled");
  });
});

describe("sessionRelation", () => {
  it("knows the host, the joined, and everyone else", () => {
    expect(sessionRelation(base, "host")).toBe("hosting");
    expect(sessionRelation(base, "me")).toBe("joined");
    expect(sessionRelation(base, "someone")).toBeNull();
    expect(sessionRelation(base, null)).toBeNull();
  });
});

describe("times", () => {
  it("writes ranges with 'to', sharing AM/PM when both ends agree", () => {
    expect(formatTimeRange(base.startsAt, base.endsAt)).toBe("7:00 to 9:00 PM");
    expect(formatTimeRange(at("2026-10-21T16:00:00Z"), at("2026-10-21T18:00:00Z"))).toBe("11:00 AM to 1:00 PM");
  });

  it("leads with the day when asked, and shows a date for a past session", () => {
    expect(cardTime(base.startsAt, base.endsAt, now)).toBe("7:00 to 9:00 PM");
    expect(cardTime(base.startsAt, base.endsAt, now, true)).toBe("Today, 7:00 to 9:00 PM");
    expect(cardTime(at("2026-10-07T20:00:00Z"), at("2026-10-07T22:00:00Z"), now)).toBe("Wed Oct 7");
  });
});

describe("avatars and seats", () => {
  it("takes initials from first and last names", () => {
    expect(initialsOf("Priya Raman")).toBe("PR");
    expect(initialsOf("Moses")).toBe("M");
    expect(initialsOf(null)).toBe("?");
  });

  it("shows three faces and counts the rest", () => {
    const going = ["a", "b", "c", "d", "e"].map((userId) => ({ userId, displayName: userId }));
    const stack = avatarStack(going);
    expect(stack.faces).toHaveLength(3);
    expect(stack.more).toBe(2);
    expect(avatarStack(undefined)).toEqual({ faces: [], more: 0 });
  });

  it("gives a person the same colour every time", () => {
    expect(avatarColour("abc")).toEqual(avatarColour("abc"));
  });

  it("counts seats taken of total", () => {
    expect(seatsText(3, 6)).toBe("3 of 6 seats");
  });
});

describe("boardColumn", () => {
  it("sorts sessions into the board's four columns", () => {
    expect(boardColumn(at("2026-10-20T22:00:00Z"), at("2026-10-21T01:00:00Z"), now)).toBe("now");
    expect(boardColumn(base.startsAt, base.endsAt, now)).toBe("today");
    expect(boardColumn(at("2026-10-21T20:00:00Z"), at("2026-10-21T22:00:00Z"), now)).toBe("tomorrow");
    expect(boardColumn(at("2026-10-23T20:00:00Z"), at("2026-10-23T22:00:00Z"), now)).toBe("later");
  });
});

describe("calendarSlot", () => {
  it("places a session by campus weekday and minutes from 8 AM", async () => {
    const { calendarSlot, campusClock } = await import("./session-view");
    // now: Tue 20 Oct, 6 PM campus. Session Tue 7-9 PM.
    expect(campusClock(now).weekday).toBe(1);
    expect(calendarSlot(base.startsAt, base.endsAt, now)).toEqual({ column: 1, top: 11 * 60, height: 120 });
    // Next Monday is outside this week.
    expect(calendarSlot("2026-10-26T20:00:00Z", "2026-10-26T22:00:00Z", now)).toBeNull();
  });
});
