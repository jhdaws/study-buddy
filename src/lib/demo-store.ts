// In-memory session store for the Sprint 2 demo.
//
// THIS IS NOT PERSISTENCE. Rows live in one server process's memory: they are
// gone on restart, and on Vercel each serverless invocation may see a different
// copy. It exists so `create a session` and `see it in the list` can be
// demonstrated end to end before the tables exist.
//
// T-C4 creates the real `sessions` and `session_attendees` tables and T-E2
// points the server action at them. When that lands, delete this file — the
// shapes below deliberately match docs/architecture.md §2 so the swap is a
// change of data source, not of callers.

import { findCourse, findLocation } from "./fixtures";
import type { CreateSession } from "./validation";

export type DemoSession = {
  id: string;
  departmentCode: string;
  courseNumber: string;
  courseTitle?: string;
  topic: string;
  locationId: string;
  locationName: string;
  room?: string;
  /** ISO 8601. */
  startsAt: string;
  endsAt: string;
  capacity: number;
  /**
   * Includes the host, who sits on their own roster (architecture.md §2.1).
   * A stored count would drift from a real roster; this store has no roster to
   * drift from, so it holds the number directly. T-C4 derives it instead.
   */
  attendeeCount: number;
};

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function demoSession(
  id: string,
  departmentCode: string,
  courseNumber: string,
  topic: string,
  locationId: string,
  room: string | undefined,
  startsInHours: number,
  durationHours: number,
  capacity: number,
  attendeeCount: number,
): DemoSession {
  const startsAt = hoursFromNow(startsInHours);
  const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);

  return {
    id,
    departmentCode,
    courseNumber,
    courseTitle: findCourse(departmentCode, courseNumber)?.title,
    topic,
    locationId,
    locationName: findLocation(locationId)?.name ?? locationId,
    room,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    capacity,
    attendeeCount,
  };
}

// Seeded so the list is not empty at the start of a demo, and so the states
// that matter are all visible: seats left, full, host-only, and one already
// ended to prove the list filters it out (T-E3).
const sessions: DemoSession[] = [
  demoSession("seed-1", "CS", "4278", "Sprint 2 architecture review", "featheringill-hall", "134", 2, 2, 5, 2),
  demoSession("seed-2", "MATH", "2300", "Exam 2 practice problems", "central-library", "Third floor", 4, 2, 4, 4),
  demoSession("seed-3", "CS", "2201", "Linked lists and recursion", "stevenson-center", undefined, 26, 3, 6, 1),
  demoSession("seed-ended", "CHEM", "1601", "Titration lab prep", "peabody-library", undefined, -4, 2, 4, 3),
];

export function seatsLeft(session: DemoSession): number {
  return Math.max(0, session.capacity - session.attendeeCount);
}

export function isFull(session: DemoSession): boolean {
  return seatsLeft(session) === 0;
}

/**
 * Sessions that have not ended, soonest first.
 *
 * Cancelled sessions would be excluded here too; nothing can cancel one yet
 * (US-09), so there is no status to filter on.
 */
export function listOpenSessions(now: Date = new Date()): DemoSession[] {
  return sessions
    .filter((session) => new Date(session.endsAt).getTime() > now.getTime())
    .sort(
      (a, b) =>
        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
}

export function addSession(input: CreateSession): DemoSession {
  const session: DemoSession = {
    id: crypto.randomUUID(),
    departmentCode: input.departmentCode,
    courseNumber: input.courseNumber,
    courseTitle: findCourse(input.departmentCode, input.courseNumber)?.title,
    topic: input.topic,
    locationId: input.locationId,
    locationName: findLocation(input.locationId)?.name ?? input.locationId,
    // The form sends "" for an untouched optional field; store absence as
    // absence so the card does not render an empty room line.
    room: input.room ? input.room : undefined,
    // datetime-local submits wall-clock time with no zone. Normalise once here
    // so everything downstream compares ISO strings.
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
    capacity: input.capacity,
    // The host is on the roster from the moment the session exists.
    attendeeCount: 1,
  };

  sessions.push(session);
  return session;
}

export function findSession(id: string): DemoSession | undefined {
  return sessions.find((session) => session.id === id);
}
