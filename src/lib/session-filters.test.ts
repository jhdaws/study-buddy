import { describe, expect, it } from "vitest";

import type { SessionListItem } from "@/lib/sessions";

import { filterSessions, groupByDay, isFiltered, NO_FILTERS } from "./session-filters";

// Thursday 1 Oct 2026, 10 AM in Nashville (CDT, UTC-5).
const now = new Date("2026-10-01T15:00:00Z");

function session(overrides: Partial<SessionListItem>): SessionListItem {
  return {
    id: overrides.id ?? "s",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Design patterns review",
    locationLabel: "Featheringill Hall",
    room: null,
    startsAt: "2026-10-01T19:00:00.000Z", // Thu 2 PM
    endsAt: "2026-10-01T21:00:00.000Z",
    capacity: 4,
    attendeeCount: 2,
    seatsLeft: 2,
    hostDisplayName: "Priya",
    ...overrides,
  };
}

const live = session({ id: "live", startsAt: "2026-10-01T14:30:00.000Z", endsAt: "2026-10-01T16:00:00.000Z" });
const later = session({ id: "later" });
const full = session({
  id: "full",
  course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
  topic: "Exam 2 practice problems",
  locationLabel: "Central Library",
  capacity: 3,
  attendeeCount: 3,
  seatsLeft: 0,
});
const tomorrow = session({
  id: "tomorrow",
  course: { departmentCode: "CHEM", number: "1601L", title: null },
  locationLabel: "Café on 21st",
  startsAt: "2026-10-02T21:00:00.000Z",
  endsAt: "2026-10-02T23:00:00.000Z",
});
const nextWeek = session({ id: "next-week", startsAt: "2026-10-08T19:00:00.000Z", endsAt: "2026-10-08T21:00:00.000Z" });
const all = [live, later, full, tomorrow, nextWeek];
const ids = (list: SessionListItem[]) => list.map((s) => s.id);

describe("filterSessions", () => {
  it("returns everything, in order, with no filters", () => {
    expect(ids(filterSessions(all, NO_FILTERS, now))).toEqual(ids(all));
  });

  it("matches course codes however they are typed", () => {
    for (const query of ["math 2410", "MATH2410", "m.a.t.h. 2410", "2410"]) {
      expect(ids(filterSessions(all, { ...NO_FILTERS, query }, now))).toEqual(["full"]);
    }
  });

  it("matches title, topic and place, every word in any order, ignoring accents", () => {
    expect(ids(filterSessions(all, { ...NO_FILTERS, query: "linear exam" }, now))).toEqual(["full"]);
    expect(ids(filterSessions(all, { ...NO_FILTERS, query: "cafe" }, now))).toEqual(["tomorrow"]);
    expect(ids(filterSessions(all, { ...NO_FILTERS, query: "linear nowhere" }, now))).toEqual([]);
  });

  it("filters by when, in campus days", () => {
    expect(ids(filterSessions(all, { ...NO_FILTERS, when: "now" }, now))).toEqual(["live"]);
    expect(ids(filterSessions(all, { ...NO_FILTERS, when: "today" }, now))).toEqual(["live", "later", "full"]);
    expect(ids(filterSessions(all, { ...NO_FILTERS, when: "week" }, now))).toEqual([
      "live",
      "later",
      "full",
      "tomorrow",
    ]);
  });

  it("drops full sessions with hasSeats, combined with the rest", () => {
    expect(ids(filterSessions(all, { ...NO_FILTERS, hasSeats: true, when: "today" }, now))).toEqual([
      "live",
      "later",
    ]);
  });
});

describe("isFiltered", () => {
  it("is false only with no query, all times and seats not required", () => {
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, query: "  " })).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, query: "cs" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, when: "today" })).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, hasSeats: true })).toBe(true);
  });
});

describe("groupByDay", () => {
  it("groups consecutive sessions under campus-day labels", () => {
    const groups = groupByDay(all, now);
    expect(groups.map((g) => [g.label, ids(g.sessions)])).toEqual([
      ["Today", ["live", "later", "full"]],
      ["Tomorrow", ["tomorrow"]],
      [groups[2].label, ["next-week"]],
    ]);
    expect(groups[2].label).toMatch(/Thu, Oct 8/);
  });

  it("counts a session still running from yesterday as today's", () => {
    const overnight = session({ id: "overnight", startsAt: "2026-10-01T04:00:00.000Z", endsAt: "2026-10-01T16:00:00.000Z" });
    expect(groupByDay([overnight], now)[0].label).toBe("Today");
  });
});
