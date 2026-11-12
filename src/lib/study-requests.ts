// Reading study requests (US-16, R1). Owner: Track R.
//
// SERVER ONLY, for the same reasons as src/lib/sessions.ts: the query runs
// through the cookie-bound client, so RLS applies as the signed-in student
// and a signed-out caller gets nothing. Client components take the result as
// props and may `import type` these types.
//
// The table, its trigger and its policies: supabase/migrations/
// *_r1_study_requests.sql. There is no write here -- requestSession() and
// withdrawRequest() in src/app/sessions/actions.ts do that through the
// INSERT and DELETE policies.

import "server-only";

import { listBlockedUserIds } from "@/lib/blocks";
import type { CourseLabel } from "@/lib/sessions";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Everyone currently asking for one course -- a row in the "students are
 * waiting" list on /sessions.
 *
 * Grouped by COURSE, not by request, because that is what the page says:
 * "3 students want CS 3251". One student asking is one request, which the
 * unique constraint on (course_id, author_id) guarantees, so `count` is a
 * count of people.
 */
export type StudyRequestGroup = {
  /** `courses.id` -- a React key, and what "Host one" prefills from. */
  courseId: string;
  course: CourseLabel;
  /** Live requests for this course. At least 1: a group with none is dropped. */
  count: number;
  /**
   * The signed-in student is one of the askers. The UI shows them "Withdraw"
   * rather than a second "Ask" button -- asking twice is impossible anyway
   * (the unique constraint), and offering it would just produce an error.
   */
  viewerAsked: boolean;
  /** The id of the VIEWER's own request, for withdrawRequest(). Null unless `viewerAsked`. */
  viewerRequestId: string | null;
  /** The notes students left, newest first, blanks dropped. Often empty. */
  notes: string[];
};

/**
 * Open study requests, most-wanted course first (US-16).
 *
 * `expires_at=gt.now` uses Postgres's `now` literal, so a request lapses by
 * the DATABASE's clock -- the same reasoning as `ends_at=gt.now` in
 * listSessions(). Nothing deletes expired rows (see the migration); this
 * filter is what "7 days" means.
 *
 * `courses!inner`: `course_id` is NOT NULL, so an empty embed can only mean a
 * broken read policy, and then the request is left out rather than rendered
 * without a course name. Unlike listSessions()' `profiles` embed this needs
 * no named constraint -- there is only one foreign key from study_requests to
 * courses, so PostgREST cannot be ambiguous about it.
 *
 * Signed out this returns [] rather than throwing: /sessions is behind the
 * proxy, but a stale tab is not an error worth an error page.
 */
export async function listStudyRequests(): Promise<StudyRequestGroup[]> {
  const supabase = await createClient();

  const [viewer, blockedIds, { data, error }] = await Promise.all([
    getCurrentUser(),
    listBlockedUserIds(),
    supabase
      .from("study_requests")
      .select(
        `id, course_id, author_id, note,
       courses!inner (department_code, number, title)`,
      )
      .gt("expires_at", "now")
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    throw new Error(`Could not load the study requests: ${error.message}`);
  }

  // US-22: a blocked student's own asks never show, or count toward the
  // group's total -- classmates still see "N students want CS 3251" with
  // whatever is left after removing them, not a number the blocker knows is
  // one too many.
  const blocked = new Set(blockedIds);
  const visible = (data ?? []).filter((row) => !blocked.has(row.author_id));

  // Grouped here rather than in SQL for the same reason searchCourses ranks
  // here: PostgREST cannot group by an embedded column, and this set is
  // bounded by the courses one campus is actively asking about. If it ever
  // grows past that, this is the line to replace with a database function.
  const groups = new Map<string, StudyRequestGroup>();

  for (const row of visible) {
    const group = groups.get(row.course_id) ?? {
      courseId: row.course_id,
      course: {
        departmentCode: row.courses.department_code,
        number: row.courses.number,
        title: row.courses.title,
      },
      count: 0,
      viewerAsked: false,
      viewerRequestId: null,
      notes: [],
    };

    group.count += 1;
    if (viewer && row.author_id === viewer.id) {
      group.viewerAsked = true;
      group.viewerRequestId = row.id;
    }
    if (row.note) group.notes.push(row.note);

    groups.set(row.course_id, group);
  }

  // Most-wanted first: that is the signal a would-be host is looking for.
  // Ties break by course so the order is stable between requests rather than
  // following whatever order the rows came back in.
  return [...groups.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.course.departmentCode.localeCompare(b.course.departmentCode) ||
      a.course.number.localeCompare(b.course.number),
  );
}
