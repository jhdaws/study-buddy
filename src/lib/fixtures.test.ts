import { describe, expect, it } from "vitest";

import coursesJson from "../../data/courses.json";
import departmentsJson from "../../data/departments.json";
import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "./env";
import {
  FIXTURE_COURSES,
  FIXTURE_DEPARTMENTS,
  FIXTURE_LOCATIONS,
  FIXTURE_PLACES,
  FIXTURE_PROFILES,
  FIXTURE_ROSTERS,
  FIXTURE_USER,
  fixtureCourseSuggestions,
  fixtureDepartments,
  fixtureSessionList,
  fixtureSessions,
} from "./fixtures";
import { MIN_CAPACITY } from "./validation";

/**
 * The fixtures are the W4 stubs' whole world (docs/contracts.md). These tests
 * keep them consistent with data/ and with each other, and hold the stub
 * bodies of src/lib/sessions.ts to the rules the real queries must follow.
 */

const NOW = new Date("2026-10-01T15:07:00.000Z");

/** Great-circle distance in metres. A test helper, not M3's check. */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

describe("fixture departments and courses", () => {
  it("are rows of data/, verbatim", () => {
    for (const department of FIXTURE_DEPARTMENTS) {
      expect(departmentsJson.departments).toContainEqual(department);
    }
    for (const { department_code, number, title } of FIXTURE_COURSES) {
      expect(coursesJson.courses).toContainEqual({ department_code, number, title });
    }
  });

  it("belong to fixture departments, with unique ids", () => {
    const codes = FIXTURE_DEPARTMENTS.map((row) => row.code);
    for (const course of FIXTURE_COURSES) {
      expect(codes).toContain(course.department_code);
    }
    expect(new Set(FIXTURE_COURSES.map((row) => row.id)).size).toBe(FIXTURE_COURSES.length);
  });
});

describe("fixture places and locations", () => {
  it("pair up one to one by place id, and the ids are unmistakably fake", () => {
    expect(FIXTURE_LOCATIONS.map((row) => row.place_id).sort()).toEqual(
      FIXTURE_PLACES.map((place) => place.placeId).sort(),
    );
    for (const place of FIXTURE_PLACES) {
      expect(place.placeId).toMatch(/^ChIJ-FAKE-/);
    }
  });

  it("sit inside the campus radius", () => {
    for (const location of FIXTURE_LOCATIONS) {
      expect(metresBetween(CAMPUS_CENTER, location)).toBeLessThan(CAMPUS_RADIUS_METERS);
    }
  });
});

describe("fixture sessions", () => {
  const sessions = fixtureSessions(NOW);

  it("reference fixture courses, locations and profiles", () => {
    const courseIds = FIXTURE_COURSES.map((row) => row.id);
    const locationIds = FIXTURE_LOCATIONS.map((row) => row.id);
    const profileIds = FIXTURE_PROFILES.map((row) => row.id);

    for (const session of sessions) {
      expect(courseIds).toContain(session.course_id);
      expect(locationIds).toContain(session.location_id);
      expect(profileIds).toContain(session.host_id);
      for (const attendee of FIXTURE_ROSTERS[session.id]) {
        expect(profileIds).toContain(attendee);
      }
    }
  });

  it("obey the session rules: host first on the roster, roster within capacity, end after start", () => {
    for (const session of sessions) {
      const roster = FIXTURE_ROSTERS[session.id];
      expect(roster[0]).toBe(session.host_id);
      expect(new Set(roster).size).toBe(roster.length);
      expect(roster.length).toBeLessThanOrEqual(session.capacity);
      expect(session.capacity).toBeGreaterThanOrEqual(MIN_CAPACITY);
      expect(Date.parse(session.ends_at)).toBeGreaterThan(Date.parse(session.starts_at));
    }
  });

  it("are relative to now", () => {
    const later = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(fixtureSessions(later)[0].starts_at).not.toBe(sessions[0].starts_at);
  });
});

describe("fixtureSessionList() -- listSessions()'s stub body", () => {
  const list = fixtureSessionList(NOW);

  it("leaves out ended and cancelled sessions", () => {
    const listed = new Set(list.map((item) => item.id));
    for (const session of fixtureSessions(NOW)) {
      const shouldList = session.status === "open" && Date.parse(session.ends_at) > NOW.getTime();
      expect(listed.has(session.id)).toBe(shouldList);
    }
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.length).toBeLessThan(fixtureSessions(NOW).length);
  });

  it("orders soonest first", () => {
    const starts = list.map((item) => Date.parse(item.startsAt));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts[0]).toBeGreaterThan(NOW.getTime());
  });

  it("includes one full session and one with only the host", () => {
    const full = list.filter((item) => item.seatsLeft === 0);
    expect(full).toHaveLength(1);
    expect(full[0].attendeeCount).toBe(full[0].capacity);

    const hostOnly = list.filter((item) => item.attendeeCount === 1);
    expect(hostOnly).toHaveLength(1);
    expect(hostOnly[0].seatsLeft).toBe(hostOnly[0].capacity - 1);
    expect(hostOnly[0].hostDisplayName).toBe(FIXTURE_USER.displayName);
  });

  it("derives seats left from the roster", () => {
    for (const item of list) {
      expect(item.attendeeCount).toBe(FIXTURE_ROSTERS[item.id].length);
      expect(item.seatsLeft).toBe(item.capacity - item.attendeeCount);
    }
  });

  it("carries the course and the rest of the card", () => {
    const cs3251 = list.find(
      (item) => item.course.departmentCode === "CS" && item.course.number === "3251",
    );
    expect(cs3251).toMatchObject({
      course: { title: "Intermediate Software Design" },
      topic: expect.any(String),
      locationLabel: expect.any(String),
      hostDisplayName: expect.any(String),
    });
    expect(list.some((item) => item.room === null)).toBe(true);
  });
});

describe("fixtureDepartments() -- listDepartments()'s stub body", () => {
  it("returns every fixture department, ordered by code", () => {
    const codes = fixtureDepartments().map((row) => row.code);
    expect(codes).toEqual(FIXTURE_DEPARTMENTS.map((row) => row.code).sort());
  });
});

describe("fixtureCourseSuggestions() -- searchCourses()'s stub body", () => {
  it("matches a number prefix within the department only", () => {
    expect(fixtureCourseSuggestions("CS", "32", 8).map((row) => row.number)).toEqual(["3251"]);
    expect(fixtureCourseSuggestions("MATH", "32", 8)).toEqual([]);
  });

  it("keeps the letter suffix distinct", () => {
    expect(fixtureCourseSuggestions("CHEM", "1601", 8).map((row) => row.number).sort()).toEqual([
      "1601",
      "1601L",
    ]);
  });

  it("matches words in the title too", () => {
    expect(fixtureCourseSuggestions("CHEM", "laboratory", 8).map((row) => row.number)).toEqual([
      "1601L",
    ]);
  });

  it("orders by how many sessions used each course, then by number", () => {
    const suggestions = fixtureCourseSuggestions("CS", "", 8);
    const counts = suggestions.map((row) => row.sessionCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    // CS 2201 has no fixture sessions; 3251 and 4278 have one each.
    expect(suggestions.map((row) => row.number)).toEqual(["3251", "4278", "2201"]);
  });

  it("counts ended and cancelled sessions as use", () => {
    const [econ] = fixtureCourseSuggestions("ECON", "1010", 8);
    expect(econ.sessionCount).toBe(1);
  });

  it("returns nothing for an unknown department, and respects the limit", () => {
    expect(fixtureCourseSuggestions("NOPE", "", 8)).toEqual([]);
    expect(fixtureCourseSuggestions("CS", "", 2)).toHaveLength(2);
  });

  it("trims and uppercases, but does not otherwise normalise (S2's job)", () => {
    expect(fixtureCourseSuggestions(" cs ", " 3251 ", 8)).toHaveLength(1);
  });
});
