// Fixture data for the W4 stubs (docs/contracts.md).
//
// Every stub in the app reads from here until its owning track replaces it,
// so the whole app clicks through before auth, the sessions API, or Google
// Places exist. The rows are shaped like the real tables (database.types.ts),
// so a stub reads them the way the real query will read the database.
//
// Nothing here is real:
//   - ids are patterned fakes (00000000-..., 10000000-..., ...);
//   - place ids start with `ChIJ-FAKE-` so one can never be mistaken for, or
//     sent to Google as, a real Places id;
//   - coordinates are rough approximations, unverified, only good enough to
//     sit inside CAMPUS_RADIUS_METERS.
// Departments and courses are a subset of data/*.json and match it exactly
// (fixtures.test.ts checks).
//
// Session times are computed from "now" on every call, so the list always has
// upcoming sessions no matter when it is run.
//
// The bottom of the file holds the stub bodies of src/lib/sessions.ts --
// fixtureSessionList() and friends -- as pure functions, because sessions.ts
// is server-only and Vitest cannot import it. They filter and derive the way
// the real queries must, and fixtures.test.ts holds them to it.
//
// Client-safe on purpose: <LocationPicker>'s stub reads FIXTURE_PLACES in the
// browser. Do not import server-only code here (`import type` is fine -- it is
// erased). W6 removes whatever the app no longer uses once the tracks land;
// tests may keep the rest.

import type { Tables } from "@/lib/database.types";
import type {
  CourseSuggestion,
  Department,
  SessionListItem,
} from "@/lib/sessions";
import type { CurrentUser } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** Who requireUser() returns until A4 lands. Hosts the host-only session. */
export const FIXTURE_USER: CurrentUser = {
  id: "00000000-0000-4000-8000-000000000001",
  displayName: "Fixture Student",
};

const PRIYA = "00000000-0000-4000-8000-000000000002";
const MARCUS = "00000000-0000-4000-8000-000000000003";
const JORDAN = "00000000-0000-4000-8000-000000000004";
const SAM = "00000000-0000-4000-8000-000000000005";

export const FIXTURE_PROFILES: Pick<Tables<"profiles">, "id" | "display_name">[] = [
  { id: FIXTURE_USER.id, display_name: FIXTURE_USER.displayName },
  { id: PRIYA, display_name: "Priya" },
  { id: MARCUS, display_name: "Marcus" },
  { id: JORDAN, display_name: "Jordan" },
  { id: SAM, display_name: "Sam" },
];

// ---------------------------------------------------------------------------
// Departments and courses -- verbatim from data/departments.json and
// data/courses.json. `CHEM 1601L` is here for the letter suffix.
// ---------------------------------------------------------------------------

export const FIXTURE_DEPARTMENTS: Pick<Tables<"departments">, "code" | "name">[] = [
  { code: "CHEM", name: "Chemistry" },
  { code: "CS", name: "Computer Science" },
  { code: "ECON", name: "Economics" },
  { code: "MATH", name: "Mathematics" },
  { code: "PHYS", name: "Physics" },
];

type FixtureCourse = Pick<Tables<"courses">, "id" | "department_code" | "number" | "title">;

const CHEM_1601: FixtureCourse = { id: "10000000-0000-4000-8000-000000000001", department_code: "CHEM", number: "1601", title: "General Chemistry" };
const CHEM_1601L: FixtureCourse = { id: "10000000-0000-4000-8000-000000000002", department_code: "CHEM", number: "1601L", title: "General Chemistry Laboratory" };
const CS_2201: FixtureCourse = { id: "10000000-0000-4000-8000-000000000003", department_code: "CS", number: "2201", title: "Program Design and Data Structures" };
const CS_3251: FixtureCourse = { id: "10000000-0000-4000-8000-000000000004", department_code: "CS", number: "3251", title: "Intermediate Software Design" };
const CS_4278: FixtureCourse = { id: "10000000-0000-4000-8000-000000000005", department_code: "CS", number: "4278", title: "Principles of Software Engineering" };
const ECON_1010: FixtureCourse = { id: "10000000-0000-4000-8000-000000000006", department_code: "ECON", number: "1010", title: "Principles of Macroeconomics" };
const MATH_2410: FixtureCourse = { id: "10000000-0000-4000-8000-000000000007", department_code: "MATH", number: "2410", title: "Methods of Linear Algebra" };
const PHYS_1601: FixtureCourse = { id: "10000000-0000-4000-8000-000000000008", department_code: "PHYS", number: "1601", title: "General Physics I" };

export const FIXTURE_COURSES: FixtureCourse[] = [
  CHEM_1601, CHEM_1601L, CS_2201, CS_3251, CS_4278, ECON_1010, MATH_2410, PHYS_1601,
];

// ---------------------------------------------------------------------------
// Places and locations
// ---------------------------------------------------------------------------

/**
 * What the picker offers: a Places id and the name Google would suggest, which
 * the form uses to prefill `locationLabel`.
 */
export type FixturePlace = {
  placeId: string;
  label: string;
  kind: "campus building" | "library" | "cafe";
};

export const FIXTURE_PLACES: FixturePlace[] = [
  { placeId: "ChIJ-FAKE-featheringill-hall", label: "Featheringill Hall", kind: "campus building" },
  { placeId: "ChIJ-FAKE-central-library", label: "Central Library", kind: "library" },
  { placeId: "ChIJ-FAKE-hillsboro-village-cafe", label: "Hillsboro Village café", kind: "cafe" },
];

const VALIDATED_AT = "2026-09-29T12:00:00.000Z";

const FEATHERINGILL: Tables<"locations"> = { id: "20000000-0000-4000-8000-000000000001", place_id: "ChIJ-FAKE-featheringill-hall", lat: 36.1445, lng: -86.8035, validated_at: VALIDATED_AT };
const LIBRARY: Tables<"locations"> = { id: "20000000-0000-4000-8000-000000000002", place_id: "ChIJ-FAKE-central-library", lat: 36.1452, lng: -86.8006, validated_at: VALIDATED_AT };
const CAFE: Tables<"locations"> = { id: "20000000-0000-4000-8000-000000000003", place_id: "ChIJ-FAKE-hillsboro-village-cafe", lat: 36.1369, lng: -86.7998, validated_at: VALIDATED_AT };

/**
 * The `locations` rows resolvePlace() would have stored for FIXTURE_PLACES:
 * one per place, same `place_id`.
 */
export const FIXTURE_LOCATIONS: Tables<"locations">[] = [FEATHERINGILL, LIBRARY, CAFE];

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const SESSION_IDS = {
  cs3251: "30000000-0000-4000-8000-000000000001",
  math2410Full: "30000000-0000-4000-8000-000000000002",
  chem1601LHostOnly: "30000000-0000-4000-8000-000000000003",
  cs4278: "30000000-0000-4000-8000-000000000004",
  econ1010Ended: "30000000-0000-4000-8000-000000000005",
  phys1601Cancelled: "30000000-0000-4000-8000-000000000006",
} as const;

/** Who is on each session's roster, host first. Seats left derive from this. */
export const FIXTURE_ROSTERS: Record<string, string[]> = {
  [SESSION_IDS.cs3251]: [PRIYA, MARCUS],
  [SESSION_IDS.math2410Full]: [MARCUS, JORDAN, SAM], // capacity 3: full
  [SESSION_IDS.chem1601LHostOnly]: [FIXTURE_USER.id], // only the host
  [SESSION_IDS.cs4278]: [JORDAN, PRIYA, FIXTURE_USER.id],
  [SESSION_IDS.econ1010Ended]: [SAM, PRIYA],
  [SESSION_IDS.phys1601Cancelled]: [PRIYA],
};

const HOUR = 60 * 60 * 1000;
const QUARTER_HOUR = 15 * 60 * 1000;

/**
 * `sessions` rows, with times relative to `now`:
 *
 * | Course      | Starts        | Capacity | Roster | Note                    |
 * | ----------- | ------------- | -------- | ------ | ----------------------- |
 * | CS 3251     | in ~1 hour    | 4        | 2      |                         |
 * | MATH 2410   | in ~2 hours   | 3        | 3      | **full**                |
 * | CHEM 1601L  | tomorrow      | 5        | 1      | **only the host**; café, no room |
 * | CS 4278     | in two days   | 6        | 3      |                         |
 * | ECON 1010   | yesterday     | 4        | 2      | ended -- listSessions() must drop it |
 * | PHYS 1601   | tomorrow      | 4        | 1      | cancelled -- listSessions() must drop it |
 *
 * Deliberately not in start order, so a missing sort shows.
 */
export function fixtureSessions(now: Date = new Date()): Tables<"sessions">[] {
  // Round up to the next quarter hour, like a person picking a time would.
  const base = Math.ceil(now.getTime() / QUARTER_HOUR) * QUARTER_HOUR;
  const at = (hours: number) => new Date(base + hours * HOUR).toISOString();
  const createdAt = new Date(now.getTime() - 24 * HOUR).toISOString();

  const row = (
    fields: Omit<Tables<"sessions">, "status" | "created_at"> &
      Partial<Pick<Tables<"sessions">, "status">>,
  ): Tables<"sessions"> => ({ status: "open", created_at: createdAt, ...fields });

  return [
    row({
      id: SESSION_IDS.cs4278,
      host_id: JORDAN,
      course_id: CS_4278.id,
      location_id: FEATHERINGILL.id,
      location_label: "Featheringill Hall",
      room: "Room 100",
      topic: "Sprint demo prep",
      starts_at: at(48),
      ends_at: at(50),
      capacity: 6,
    }),
    row({
      id: SESSION_IDS.math2410Full,
      host_id: MARCUS,
      course_id: MATH_2410.id,
      location_id: LIBRARY.id,
      location_label: "Central Library",
      room: "Group study room 3",
      topic: "Exam 2 practice problems",
      starts_at: at(2),
      ends_at: at(4),
      capacity: 3,
    }),
    row({
      id: SESSION_IDS.econ1010Ended,
      host_id: SAM,
      course_id: ECON_1010.id,
      location_id: LIBRARY.id,
      location_label: "Central Library",
      room: null,
      topic: "Problem set 3",
      starts_at: at(-26),
      ends_at: at(-24),
      capacity: 4,
    }),
    row({
      id: SESSION_IDS.cs3251,
      host_id: PRIYA,
      course_id: CS_3251.id,
      location_id: FEATHERINGILL.id,
      location_label: "Featheringill Hall",
      room: "2nd floor study area",
      topic: "Design patterns review",
      starts_at: at(1),
      ends_at: at(3),
      capacity: 4,
    }),
    row({
      id: SESSION_IDS.phys1601Cancelled,
      host_id: PRIYA,
      course_id: PHYS_1601.id,
      location_id: LIBRARY.id,
      location_label: "Central Library",
      room: null,
      topic: "Kinematics worksheet",
      starts_at: at(25),
      ends_at: at(27),
      capacity: 4,
      status: "cancelled",
    }),
    row({
      id: SESSION_IDS.chem1601LHostOnly,
      host_id: FIXTURE_USER.id,
      course_id: CHEM_1601L.id,
      location_id: CAFE.id,
      location_label: "Café on 21st",
      room: null,
      topic: "Lab report write-up",
      starts_at: at(24),
      ends_at: at(26),
      capacity: 5,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Stub bodies for src/lib/sessions.ts (S4 replaces them with queries)
// ---------------------------------------------------------------------------

function fixtureCourse(courseId: string): FixtureCourse {
  const course = FIXTURE_COURSES.find((row) => row.id === courseId);
  if (!course) throw new Error(`Fixture session uses unknown course ${courseId}`);
  return course;
}

function fixtureDisplayName(userId: string | null): string | null {
  if (userId === null) return null;
  return FIXTURE_PROFILES.find((row) => row.id === userId)?.display_name ?? null;
}

/**
 * listSessions() on fixtures: open sessions that have not ended at `now`,
 * soonest first, with the roster count and seats left derived.
 */
export function fixtureSessionList(now: Date = new Date()): SessionListItem[] {
  const nowMs = now.getTime();

  return fixtureSessions(now)
    .filter((row) => row.status === "open" && Date.parse(row.ends_at) > nowMs)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    .map((row) => {
      const course = fixtureCourse(row.course_id);
      const attendeeCount = FIXTURE_ROSTERS[row.id]?.length ?? 0;
      return {
        id: row.id,
        course: {
          departmentCode: course.department_code,
          number: course.number,
          title: course.title,
        },
        topic: row.topic,
        locationLabel: row.location_label,
        room: row.room,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        capacity: row.capacity,
        attendeeCount,
        seatsLeft: Math.max(0, row.capacity - attendeeCount),
        hostDisplayName: fixtureDisplayName(row.host_id),
      };
    });
}

/** listDepartments() on fixtures: ordered by code. */
export function fixtureDepartments(): Department[] {
  return FIXTURE_DEPARTMENTS.map(({ code, name }) => ({ code, name })).sort(
    (a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );
}

/**
 * searchCourses() on fixtures: courses in the department whose number starts
 * with the query or whose title contains it, most-used first. The department
 * and query are only trimmed and uppercased -- real normalisation is S2's.
 */
export function fixtureCourseSuggestions(
  departmentCode: string,
  query: string,
  limit: number,
): CourseSuggestion[] {
  const department = departmentCode.trim().toUpperCase();
  const needle = query.trim().toUpperCase();

  // Every session counts, ended and cancelled included: it measures use.
  const sessionCounts = new Map<string, number>();
  for (const row of fixtureSessions()) {
    sessionCounts.set(row.course_id, (sessionCounts.get(row.course_id) ?? 0) + 1);
  }

  return FIXTURE_COURSES.filter(
    (course) =>
      course.department_code === department &&
      (course.number.startsWith(needle) ||
        (course.title ?? "").toUpperCase().includes(needle)),
  )
    .map((course) => ({
      id: course.id,
      departmentCode: course.department_code,
      number: course.number,
      title: course.title,
      sessionCount: sessionCounts.get(course.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.sessionCount - a.sessionCount ||
        (a.number < b.number ? -1 : a.number > b.number ? 1 : 0),
    )
    .slice(0, limit);
}
