/**
 * The signed-in Home (H1, #128): the sections, from data the page has
 * already read. Split from src/app/page.tsx so the section logic -- which
 * course sections show, what they leave out -- is unit tested
 * (HomeSignedIn.test.tsx); page files may only export the page itself.
 */

import Link from "next/link";

import SessionCard from "@/components/SessionCard";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  LINK,
  PAGE_LEAD,
  PAGE_TITLE,
  PANEL,
  SECTION_TITLE,
} from "@/components/ui/styles";
import type { NewCourseSession } from "@/lib/course-notifications";
import { campusDayOffset, formatCourseCode, formatSessionTime, isInProgress } from "@/lib/format";
import { formatCourseParam } from "@/lib/session-course";
import type { CourseLabel, MySession, PastSession, SessionListItem } from "@/lib/sessions";
import type { StudyRequestGroup } from "@/lib/study-requests";

/** Sessions shown under "In your courses" before the link to Browse. */
export const IN_YOUR_COURSES_LIMIT = 5;

/** "4 sessions open on campus, 2 of them today." -- one plain line. */
function statusLine(sessions: SessionListItem[], now: Date): string {
  if (sessions.length === 0) return "No sessions are open on campus right now.";
  const live = sessions.filter((s) => isInProgress(s.startsAt, s.endsAt, now)).length;
  const today = sessions.filter((s) => campusDayOffset(new Date(s.startsAt), now) <= 0).length;
  const total = `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} open on campus`;
  if (live > 0) return `${total}, ${live} happening now.`;
  if (today > 0) return `${total}, ${today} of them today.`;
  return `${total}.`;
}

/** `CS-3251`, for matching a course across readers that each return their own shape. */
function courseKey(course: Pick<CourseLabel, "departmentCode" | "number">): string {
  return formatCourseParam(course);
}

/** "Host it again" and "Host one": the create form, prefilled with the course (#124). */
function hostLink(course: Pick<CourseLabel, "departmentCode" | "number">): string {
  const params = new URLSearchParams({ department: course.departmentCode, course: course.number });
  return `/sessions/new?${params.toString()}`;
}

export default function HomeSignedIn({
  displayName,
  sessions,
  newSessions,
  mine,
  past,
  courses,
  requests,
  now,
}: {
  displayName: string | null;
  sessions: SessionListItem[] | null;
  newSessions: NewCourseSession[];
  mine: MySession[];
  past: PastSession[];
  courses: CourseLabel[];
  requests: StudyRequestGroup[];
  now: Date;
}) {
  const list = sessions ?? [];
  const myCourses = new Set(courses.map(courseKey));
  // "In your courses" leaves out what the sections above already show.
  const shown = new Set([...mine.map((s) => s.id), ...newSessions.map((s) => s.id)]);
  const inMyCourses = list.filter((s) => myCourses.has(courseKey(s.course)) && !shown.has(s.id));
  const myRequests = requests.filter((group) => myCourses.has(courseKey(group.course)));

  return (
    <main className="min-w-0">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>Hey{displayName ? `, ${displayName}` : ""}</h1>
          <p className={PAGE_LEAD}>
            {sessions === null
              ? "Sessions couldn't load. Check your connection and reload the page."
              : statusLine(list, now)}
          </p>
        </div>
        {/* Phones have the tab bar's Host button. */}
        <div className="hidden shrink-0 md:block">
          <Link href="/sessions/new" className={BUTTON_PRIMARY}>
            Host a session
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <section aria-labelledby="home-mine">
          <h2 id="home-mine" className={`${SECTION_TITLE} mb-2`}>
            Your upcoming sessions
          </h2>
          {mine.length === 0 ? (
            <div className={`${PANEL} px-5 py-6`}>
              <p className="text-[15px] text-ink-2">
                Sessions you join or host show up here.{" "}
                <Link href="/sessions" className="font-semibold text-signal hover:underline">
                  Browse sessions
                </Link>
              </p>
            </div>
          ) : (
            <ul className={`${PANEL} divide-y divide-line`}>
              {mine.map((session) => (
                <li key={session.id}>
                  {session.hosting && (
                    <p className="px-4 pt-3 text-xs font-semibold tracking-wide text-signal uppercase">
                      You&apos;re hosting
                    </p>
                  )}
                  <SessionCard session={session} now={now} showDay headingLevel="h3" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {newSessions.length > 0 && (
          <section aria-labelledby="home-new-in-courses">
            <h2 id="home-new-in-courses" className={`${SECTION_TITLE} mb-2`}>
              New in your courses
            </h2>
            <ul className={`${PANEL} divide-y divide-line`}>
              {newSessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/sessions/${session.id}`}
                    className="flex min-h-11 flex-col gap-0.5 px-4 py-3 hover:bg-paper"
                  >
                    <span className="text-[13px] font-semibold text-signal">
                      {formatCourseCode(session.course)}
                    </span>
                    <span className="text-[15px] font-semibold text-ink">{session.topic}</span>
                    <span className="text-[13px] text-ink-2">
                      {formatSessionTime(session.startsAt, session.endsAt, now)} ·{" "}
                      {session.locationLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {courses.length === 0 ? (
          <section aria-labelledby="home-courses-nudge" className={`${PANEL} px-5 py-6`}>
            <h2 id="home-courses-nudge" className={SECTION_TITLE}>
              See sessions in your courses
            </h2>
            <p className="mt-1 text-[15px] text-ink-2">
              Add the courses you&apos;re taking to your profile, and Home shows sessions and
              requests for them.
            </p>
            <Link href="/profile" className={`${BUTTON_SECONDARY} mt-4 px-4`}>
              Add your courses
            </Link>
          </section>
        ) : (
          <>
            <section aria-labelledby="home-in-courses">
              <h2 id="home-in-courses" className={`${SECTION_TITLE} mb-2`}>
                In your courses
              </h2>
              {inMyCourses.length === 0 ? (
                <div className={`${PANEL} px-5 py-6`}>
                  <p className="text-[15px] text-ink-2">
                    No other open sessions in {courses.map(formatCourseCode).join(", ")} right now.{" "}
                    <Link href="/sessions/new" className="font-semibold text-signal hover:underline">
                      Host one
                    </Link>
                  </p>
                </div>
              ) : (
                <>
                  <ul className={`${PANEL} divide-y divide-line`}>
                    {inMyCourses.slice(0, IN_YOUR_COURSES_LIMIT).map((session) => (
                      <li key={session.id}>
                        <SessionCard session={session} now={now} showDay headingLevel="h3" />
                      </li>
                    ))}
                  </ul>
                  {inMyCourses.length > IN_YOUR_COURSES_LIMIT && (
                    <Link href="/sessions" className={`${LINK} mt-2`}>
                      See all {inMyCourses.length} in your courses
                    </Link>
                  )}
                </>
              )}
            </section>

            {myRequests.length > 0 && (
              <section aria-labelledby="home-requests">
                <h2 id="home-requests" className={`${SECTION_TITLE} mb-2`}>
                  Requests in your courses
                </h2>
                <ul className={`${PANEL} divide-y divide-line`}>
                  {myRequests.map((group) => (
                    <li
                      key={group.courseId}
                      className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-ink">
                          {formatCourseCode(group.course)}
                        </span>
                        <span className="block text-[13px] text-ink-2">
                          {group.count === 1
                            ? group.viewerAsked
                              ? "You asked for a session"
                              : "1 student wants a session"
                            : `${group.count} students want a session${group.viewerAsked ? ", including you" : ""}`}
                        </span>
                      </span>
                      <Link
                        href={hostLink(group.course)}
                        className="shrink-0 text-sm font-semibold text-signal hover:underline"
                      >
                        Host one
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {past.length > 0 && (
          <section aria-labelledby="home-past">
            <h2 id="home-past" className={`${SECTION_TITLE} mb-2`}>
              Your past sessions
            </h2>
            <ul className={`${PANEL} divide-y divide-line`}>
              {past.map((session) => (
                <li
                  key={session.id}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-3"
                >
                  <Link href={`/sessions/${session.id}`} className="min-w-0 hover:underline">
                    <span className="block text-[13px] font-semibold text-signal">
                      {formatCourseCode(session.course)}
                      {session.cancelled && (
                        <span className="ml-2 font-normal text-ink-2">Cancelled</span>
                      )}
                    </span>
                    <span className="block truncate text-[15px] font-semibold text-ink">
                      {session.topic}
                    </span>
                    <span className="block text-[13px] text-ink-2">
                      {formatSessionTime(session.startsAt, session.endsAt, now)} ·{" "}
                      {session.hostDisplayName ?? "Deleted user"}
                    </span>
                  </Link>
                  <Link
                    href={hostLink(session.course)}
                    aria-label={`Host ${formatCourseCode(session.course)} again`}
                    className="shrink-0 text-sm font-semibold text-signal hover:underline"
                  >
                    Host it again
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4">
          <Link href="/sessions" className={LINK}>
            Browse all sessions
          </Link>
          <p className="text-[15px] text-ink-2">
            Not seeing your course?{" "}
            <Link href="/sessions/new" className="font-semibold text-signal hover:underline">
              Host a session
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
