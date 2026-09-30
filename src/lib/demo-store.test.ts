import { describe, expect, it } from "vitest";

import {
  addSession,
  findSession,
  isFull,
  listOpenSessions,
  seatsLeft,
} from "./demo-store";
import { createSessionSchema } from "./validation";

/** Runs input through the schema the action uses, so types match reality. */
function parsed(overrides: Record<string, unknown> = {}) {
  const result = createSessionSchema().safeParse({
    departmentCode: "CS",
    courseNumber: "3251",
    topic: "Design patterns review",
    locationId: "stevenson-center",
    room: "",
    startsAt: hoursFromNow(3),
    endsAt: hoursFromNow(5),
    capacity: 4,
    ...overrides,
  });

  if (!result.success) {
    throw new Error(`fixture failed validation: ${result.error.message}`);
  }
  return result.data;
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

describe("listOpenSessions", () => {
  it("excludes sessions that have already ended (US-03)", () => {
    const ids = listOpenSessions().map((session) => session.id);

    expect(ids).toContain("seed-1");
    expect(ids).not.toContain("seed-ended");
  });

  it("returns sessions soonest first", () => {
    const starts = listOpenSessions().map((session) =>
      new Date(session.startsAt).getTime(),
    );

    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

describe("addSession", () => {
  it("puts the host on the roster, so one seat is already taken", () => {
    const session = addSession(parsed({ capacity: 5 }));

    expect(session.attendeeCount).toBe(1);
    expect(seatsLeft(session)).toBe(4);
  });

  it("makes the session findable and lists it", () => {
    const session = addSession(parsed({ topic: "Midterm 1 review" }));

    expect(findSession(session.id)?.topic).toBe("Midterm 1 review");
    expect(listOpenSessions().map((s) => s.id)).toContain(session.id);
  });

  it("resolves the course title and location name from the fixtures", () => {
    const session = addSession(parsed());

    expect(session.courseTitle).toBe("Intermediate Software Design");
    expect(session.locationName).toBe("Stevenson Center");
  });

  it("stores an empty room as absent, not as an empty string", () => {
    const session = addSession(parsed({ room: "" }));

    expect(session.room).toBeUndefined();
  });

  it("normalises times to ISO, whatever the form submitted", () => {
    // The wall-clock, zoneless shape a datetime-local input submits.
    const session = addSession(
      parsed({ startsAt: "2027-01-05T14:30", endsAt: "2027-01-05T16:30" }),
    );

    expect(session.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(session.startsAt).getMinutes()).toBe(30);
  });

  it("is full at capacity 2 once a second person is on the roster", () => {
    const session = addSession(parsed({ capacity: 2 }));
    expect(isFull(session)).toBe(false);

    session.attendeeCount = 2;

    expect(isFull(session)).toBe(true);
    expect(seatsLeft(session)).toBe(0);
  });

  it("never reports negative seats if a roster somehow overshoots", () => {
    const session = addSession(parsed({ capacity: 2 }));
    session.attendeeCount = 9;

    expect(seatsLeft(session)).toBe(0);
  });
});
