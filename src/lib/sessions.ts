// Reading sessions, departments and courses. Owner: Track S -- S4 (#21).
//
// SERVER ONLY. The real bodies read Supabase through the cookie-bound client
// in @/lib/supabase/server, so RLS applies as the signed-in user. `import
// "server-only"` makes importing this from a Client Component a build error
// rather than a confusing runtime one. (Next.js resolves "server-only" itself
// -- the npm package is optional and not installed; vitest.config.mts maps it
// to an empty module so tests can import this file. The stub logic lives in
// fixtures.ts, where it is tested.)
//
// Client code that needs these TYPES may `import type` them: type imports are
// erased before bundling. Client code that needs the DATA gets it one of two
// ways:
//   - from a Server Component, as props (listSessions, listDepartments);
//   - searchCourses only: through GET /api/courses, via
//     fetchCourseSuggestions() in @/lib/course-search. Why a Route Handler and
//     not a Server Function: see src/app/api/courses/route.ts.
//
// S4 (#21) replaced the W4 stub bodies here with real queries; the signatures
// are unchanged -- see docs/contracts.md. The fixtures they used to return
// still exist, and fixtures.test.ts still holds them to the same behaviour
// these queries implement, which is what makes the two comparable.

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { normalizeCourseNumber, normalizeDepartmentCode } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Types -- what the UI reads. Deliberately not database rows: camelCase,
// joined, and with the derived fields already derived.
// ---------------------------------------------------------------------------

/** A course as a session card shows it: `CS 3251 · Intermediate Software Design`. */
export type CourseLabel = {
  /** `departments.code`, normalised: `CS` */
  departmentCode: string;
  /** `courses.number`, normalised: `3251`, `1601L` */
  number: string;
  /** Crowdsourced and optional (ADR 0006): render without it when null. */
  title: string | null;
};

/**
 * One card in the session list (US-03). Everything W5's card needs, and
 * nothing it does not -- no host id, no roster, no coordinates.
 */
export type SessionListItem = {
  /** `sessions.id` -- for the link to /sessions/[id] (S6). */
  id: string;
  course: CourseLabel;
  topic: string;
  /** The host's own label, prefilled from Places (ADR 0008 rule 14). */
  locationLabel: string;
  /** Null when the host left it blank -- normal for a cafe. */
  room: string | null;
  /**
   * ISO 8601 in UTC (`2026-10-01T19:30:00.000Z`), as Supabase returns
   * `timestamptz`. FORMAT WITH AN EXPLICIT TIME ZONE: a Server Component on
   * Vercel runs in UTC, so `toLocaleTimeString()` there is five or six hours
   * off. Use `timeZone: "America/Chicago"`, or format in a Client Component.
   */
  startsAt: string;
  /** ISO 8601 in UTC, like `startsAt`. */
  endsAt: string;
  /** Seats in total, the host's included. At least 2. */
  capacity: number;
  /** People on the roster, the host included -- so never less than 1. */
  attendeeCount: number;
  /**
   * `capacity - attendeeCount`, floored at 0. **0 means full** -- give it the
   * "Full" treatment. Derived from the roster, never stored (ADR 0008 rule 9).
   */
  seatsLeft: number;
  /** The host's display name; null if they deleted their account ("Deleted user"). */
  hostDisplayName: string | null;
  /**
   * The host's profile id, so a card can say "Hosting" to the host. Null when
   * the host deleted their account. Optional: fixtures and older callers
   * leave it out, and the card then shows no Hosting/Joined pill.
   */
  hostId?: string | null;
  /**
   * Who is going, host first then in join order, for the card's avatar
   * initials and its Joined pill. Display names only, never emails (US-25).
   */
  going?: GoingPerson[];
};

/** One face in a card's avatar stack. */
export type GoingPerson = {
  userId: string;
  displayName: string | null;
};

/** One person on a session's roster (US-23). */
export type Attendee = {
  /** `profiles.id` -- a React key, and how the page spots the viewer. */
  userId: string;
  /** Never an email (US-25). Null only for a profile with no name yet. */
  displayName: string | null;
  isHost: boolean;
};

/**
 * The session page (S6, #52): a list item, plus what only the page shows --
 * whether it was cancelled, who hosts it, and who is going. Unlike the list,
 * cancelled and ended sessions are returned too: someone holding a link to
 * one should be told what happened, not shown a 404.
 */
export type SessionDetail = SessionListItem & {
  status: "open" | "cancelled";
  /** Where the place is, from `locations` (Google's coordinates), for the map. */
  location?: { lat: number; lng: number } | null;
  /** Null when the host deleted their account. */
  hostId: string | null;
  /** The host first, then everyone else in the order they joined. */
  attendees: Attendee[];
};

/** A department for the create-session department picker. */
export type Department = {
  /** Normalised code, `CS`. What the form submits as `departmentCode`. */
  code: string;
  /** Null for departments students added without a name (ADR 0008). */
  name: string | null;
};

/** A typeahead suggestion for the course-number field. */
export type CourseSuggestion = CourseLabel & {
  /** `courses.id` -- a stable React key. The form submits `number`, not this. */
  id: string;
  /**
   * How many sessions have used this course, ever. Suggestions arrive sorted
   * by it, most used first -- usage ranking is what floats the real course
   * above a typo'd duplicate (ADR 0008). The UI may show it ("12 sessions").
   */
  sessionCount: number;
};

/** The most suggestions searchCourses() returns. */
export const COURSE_SUGGESTION_LIMIT = 8;

// ===========================================================================
// listSessions (S4, #21)
//
// Four things in this query are less obvious than they look:
//
//   - `profiles!sessions_host_id_fkey`. Plain `profiles` is AMBIGUOUS and
//     fails at runtime with PGRST201: PostgREST finds two ways to get from a
//     session to a profile -- the host_id foreign key, and a many-to-many hop
//     through session_attendees. Only the first is wanted. Naming the
//     constraint is the documented fix, and it is the reason this is not
//     simply `profiles(display_name)`.
//
//   - `ends_at=gt.now`. `now` is a Postgres special timestamp literal, so the
//     comparison happens with the DATABASE's clock, as the stub required. If
//     this passed an ISO string from the server instead, a laptop with a
//     skewed clock would hide or show sessions that are not actually over.
//
//   - `session_attendees(count)` makes Postgres count the roster, rather than
//     this process fetching every attendee row and measuring the array.
//     attendeeCount is never read from a stored counter (ADR 0008 rule 9).
//     PostgREST returns the aggregate as `[{ count: n }]`.
//
//   - No view, so no `security_invoker` question to get wrong (ADR 0008,
//     "Watch"). The query runs through the cookie-bound client, so S1's
//     policies apply as the signed-in user; signed out it returns nothing,
//     which is checked in tests/db/session-lists.test.ts.
// ===========================================================================

/** Open sessions that have not ended, soonest first (US-03). */
export async function listSessions(): Promise<SessionListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      `id, topic, location_label, room, starts_at, ends_at, capacity, host_id,
       courses!inner (department_code, number, title),
       profiles!sessions_host_id_fkey (display_name),
       session_attendees (count),
       roster:session_attendees (user_id, joined_at, profiles (display_name))`,
    )
    .eq("status", "open")
    .gt("ends_at", "now")
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load the session list: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const attendeeCount = row.session_attendees[0]?.count ?? 0;

    return {
      hostId: row.host_id ?? null,
      going: goingFrom(row.roster, row.host_id),
      id: row.id,
      course: {
        departmentCode: row.courses.department_code,
        number: row.courses.number,
        title: row.courses.title,
      },
      topic: row.topic,
      locationLabel: row.location_label,
      room: row.room,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: row.capacity,
      attendeeCount,
      seatsLeft: Math.max(0, row.capacity - attendeeCount),
      // A deleted account leaves host_id null, so the embed yields null and
      // the card shows "Deleted user".
      hostDisplayName: row.profiles?.display_name ?? null,
    };
  });
}

type RosterRow = {
  user_id: string;
  joined_at: string;
  profiles: { display_name: string | null } | null;
};

/** The roster as avatar faces: host first, then in the order they joined. */
function goingFrom(roster: RosterRow[] | null | undefined, hostId: string | null): GoingPerson[] {
  return [...(roster ?? [])]
    .sort((a, b) => {
      const hostFirst = Number(b.user_id === hostId) - Number(a.user_id === hostId);
      return hostFirst || Date.parse(a.joined_at) - Date.parse(b.joined_at);
    })
    .map((row) => ({ userId: row.user_id, displayName: row.profiles?.display_name ?? null }));
}

// ===========================================================================
// listMySessions (redesign, 2026-10-20)
//
// Every session the signed-in student is on the roster of -- which includes
// the ones they host, because the host is always on their own roster (S1).
// Ended and cancelled ones too: My sessions has a Past tab, and the sidebar
// lists this term's courses from it.
//
// The roster is embedded twice under two names. `mine` is an INNER embed
// filtered to the student, which is what limits the sessions returned;
// `roster` is the whole roster, for the avatars and the seat count. Through
// the cookie-bound client, so RLS applies as the student.
// ===========================================================================

/** A session on My sessions: a list item, plus whether it was cancelled. */
export type MySession = SessionListItem & { status: "open" | "cancelled" };

/** The student's own sessions, hosted or joined, soonest first. */
export async function listMySessions(userId: string): Promise<MySession[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      `id, topic, location_label, room, starts_at, ends_at, capacity, host_id, status,
       courses!inner (department_code, number, title),
       profiles!sessions_host_id_fkey (display_name),
       mine:session_attendees!inner (user_id),
       roster:session_attendees (user_id, joined_at, profiles (display_name))`,
    )
    .eq("mine.user_id", userId)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load your sessions: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const going = goingFrom(row.roster, row.host_id);
    return {
      id: row.id,
      course: {
        departmentCode: row.courses.department_code,
        number: row.courses.number,
        title: row.courses.title,
      },
      topic: row.topic,
      locationLabel: row.location_label,
      room: row.room,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      capacity: row.capacity,
      attendeeCount: going.length,
      seatsLeft: Math.max(0, row.capacity - going.length),
      hostDisplayName: row.profiles?.display_name ?? null,
      hostId: row.host_id ?? null,
      going,
      status: row.status,
    };
  });
}

// ===========================================================================
// getSession (S6, #52)
//
// The same embeds as listSessions -- including the NAMED host foreign key,
// for the same PGRST201 reason -- plus the roster itself. The roster's own
// `profiles (display_name)` needs no name: from session_attendees there is
// only one way to reach a profile, its user_id.
//
// Reading the roster needs S1's session_attendees_select policy and A2's
// profiles read policy; both allow any signed-in user, so a student can see
// who is going before they join (US-23). Emails are never selected (US-25).
// ===========================================================================

/** A session id is a uuid; anything else cannot match a row. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One session with its roster, or null when there is no such session. */
export async function getSession(id: string): Promise<SessionDetail | null> {
  // Asked about a malformed id, Postgres fails with 22P02 rather than finding
  // nothing -- and a mistyped URL is a 404, not an error page.
  if (!UUID.test(id)) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      `id, topic, location_label, room, starts_at, ends_at, capacity, status, host_id,
       courses!inner (department_code, number, title),
       profiles!sessions_host_id_fkey (display_name),
       locations (lat, lng),
       session_attendees (user_id, joined_at, profiles (display_name))`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load the session: ${error.message}`);
  }
  if (!data) return null;

  const attendees: Attendee[] = [...data.session_attendees]
    .sort((a, b) => {
      const hostFirst = Number(b.user_id === data.host_id) - Number(a.user_id === data.host_id);
      return hostFirst || Date.parse(a.joined_at) - Date.parse(b.joined_at);
    })
    .map((row) => ({
      userId: row.user_id,
      displayName: row.profiles?.display_name ?? null,
      isHost: row.user_id === data.host_id,
    }));

  return {
    id: data.id,
    course: {
      departmentCode: data.courses.department_code,
      number: data.courses.number,
      title: data.courses.title,
    },
    topic: data.topic,
    locationLabel: data.location_label,
    room: data.room,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    capacity: data.capacity,
    attendeeCount: attendees.length,
    seatsLeft: Math.max(0, data.capacity - attendees.length),
    hostDisplayName: data.profiles?.display_name ?? null,
    going: attendees.map((a) => ({ userId: a.userId, displayName: a.displayName })),
    location: data.locations ? { lat: data.locations.lat, lng: data.locations.lng } : null,
    status: data.status,
    hostId: data.host_id,
    attendees,
  };
}

// ===========================================================================
// listDepartments (S4, #21)
//
// A merged department is one a student added as a duplicate and an admin has
// since pointed at the real one (ADR 0008 rule 8). It still exists, because
// courses reference it, but offering it in the picker would let the duplicate
// keep growing.
// ===========================================================================

/** Every department a host can pick, ordered by code. */
export async function listDepartments(): Promise<Department[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("departments")
    .select("code, name")
    .is("merged_into", null)
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Could not load the department list: ${error.message}`);
  }

  return data ?? [];
}

/**
 * The longest query this will look for. The Route Handler already caps what
 * it forwards; this is here so a direct caller cannot send a pasted essay
 * either.
 */
const MAX_QUERY_LENGTH = 50;

/**
 * The query, reduced to something safe to put in a PostgREST `or=(...)`
 * filter.
 *
 * That filter is a STRING, parsed as filter syntax -- so a comma, bracket or
 * quote inside it would be read as structure rather than as text, which is a
 * filter injection from a public GET endpoint. `%` and `_` matter too: they
 * are LIKE wildcards, and a bare `%` would quietly match every course.
 * Keeping only letters, digits and single spaces makes all of that
 * impossible, and costs nothing -- course titles are words, and the
 * punctuation a student types is not what distinguishes one course from
 * another.
 */
function titleNeedle(query: string): string {
  return query
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// ===========================================================================
// searchCourses (S4, #21)
//
// Why the ranking happens here and not in SQL: the session count is an
// embedded aggregate, and PostgREST cannot ORDER BY one. So the matching rows
// come back unordered and are ranked below. The set is bounded by a single
// department, which is tens of courses, not thousands -- but if a department
// ever grows past that, this is the line to replace with a database function.
//
// Both arguments are untrusted -- they arrive from GET /api/courses -- and are
// normalised with S2's (#19) normalisers, the TypeScript twins of the SQL ones
// in s2_course_normalization.sql. The two must agree, or a course the form
// thinks is new collides with one the database already has.
// ===========================================================================

/**
 * Course suggestions for the typeahead, most used first. Called by
 * GET /api/courses -- client components use fetchCourseSuggestions().
 */
export async function searchCourses(
  departmentCode: string,
  query: string,
): Promise<CourseSuggestion[]> {
  const department = normalizeDepartmentCode(departmentCode);

  // An unknown or unusable department is an empty list, never an error: the
  // host may be halfway through typing one that does not exist yet.
  if (department === "") return [];

  const supabase = await createClient();

  let courses = supabase
    .from("courses")
    .select("id, department_code, number, title, sessions (count)")
    .eq("department_code", department)
    .is("merged_into", null);

  // An empty query is not a wildcard search: it means "show me this
  // department's most-used courses", which is every course, ranked. Adding a
  // filter for it would only risk `ilike.%` behaving differently from no
  // filter at all -- a course with a null title does not match `title.ilike`.
  const needle = titleNeedle(query);
  if (needle !== "") {
    courses = courses.or(
      `number.ilike.${normalizeCourseNumber(needle)}%,title.ilike.%${needle}%`,
    );
  }

  const { data, error } = await courses;

  if (error) {
    throw new Error(`Could not search courses: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      departmentCode: row.department_code,
      number: row.number,
      title: row.title,
      // Every session counts, ended and cancelled included: this measures how
      // used a course is, which is what floats the real course above a
      // typo'd duplicate (ADR 0008).
      sessionCount: row.sessions[0]?.count ?? 0,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount || a.number.localeCompare(b.number))
    .slice(0, COURSE_SUGGESTION_LIMIT);
}
