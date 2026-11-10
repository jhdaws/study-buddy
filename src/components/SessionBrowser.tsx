"use client";

/**
 * The session list with its search box and filter chips (US-03), plus the
 * shareable course filter (US-06). Built by W5 (#12), rebuilt to the Claude
 * Design spec (page 2 "Filter chips", page 8 cards); course chips by S8.
 *
 * Takes the SessionListItem[] that listSessions() returns (via the page),
 * already soonest first with ended and cancelled sessions dropped -- and,
 * when `?course=CS-3251` is set, already restricted to that course by the
 * QUERY itself (src/lib/sessions.ts). The when/has-seats chips and the
 * search box still filter that list in the browser
 * (src/lib/session-filters.ts): those are instant and work offline once
 * loaded. The course filter cannot: a client-side filter can only hide
 * sessions the page already has, and a shared link has to mean the same
 * thing for everyone.
 *
 * Course chips write the URL with router.push() (a real navigation) so the
 * server re-runs listSessions(). The List / Map toggle keeps using
 * history.replaceState() -- switching views must not re-fetch, and it
 * already copies every other search param, so `?course=` survives a toggle.
 *
 * A Client Component for the filter state. SessionCard has no hooks, so it
 * renders unchanged inside it. `now` comes from the server request, so the
 * day labels match what the server would print.
 *
 * The empty state recruits the visitor into hosting rather than saying
 * "nothing here": with no sessions and no course filter, the only way the
 * list fills is someone starting one (the cold-start problem, US-16). A
 * course filter that matched nothing is a different empty -- clear the
 * filter, don't pretend the campus has no sessions at all.
 *
 * The map is <SessionMap>, loaded with next/dynamic (ssr: false) and only
 * when the map view is shown.
 */

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";

import MapUnavailable from "@/components/MapUnavailable";
import SessionCard from "@/components/SessionCard";
import Icon from "@/components/ui/Icon";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, MAP_HEIGHT, PANEL } from "@/components/ui/styles";
import { optionalGoogleMapsBrowserKey } from "@/lib/env";
import { formatCourseCode } from "@/lib/format";
import {
  COURSE_PARAM,
  formatCourseParam,
  type CourseFilter,
} from "@/lib/session-course";
import { sessionView, VIEW_PARAM, type SessionView } from "@/lib/session-map";
import {
  filterSessions,
  groupByDay,
  isFiltered,
  NO_FILTERS,
  WHEN_FILTERS,
  WHEN_LABELS,
  type SessionFilters,
} from "@/lib/session-filters";
import type { SessionListItem } from "@/lib/sessions";

export type SessionBrowserProps = {
  sessions: SessionListItem[];
  /** The request's "now", passed to each card. */
  now: Date;
  /**
   * The course `?course=` asked for, already parsed by the page. Null when
   * the list is unfiltered. Drives which course chip is pressed, and the
   * empty state when the query matched nothing.
   */
  courseFilter?: CourseFilter | null;
  /**
   * Every course with an open session (listSessionCourses). The page passes
   * it while a course filter is active, because `sessions` then holds only
   * that course and the other chips would disappear. Omitted otherwise: the
   * chips come from `sessions`.
   */
  courses?: CourseFilter[];
};

const CHIP =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors";
const CHIP_ON = `${CHIP} border-brand bg-brand text-white`;
const CHIP_OFF = `${CHIP} border-line bg-white text-ink hover:border-field`;

const VIEW_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors";
const VIEW_ON = `${VIEW_BUTTON} bg-brand text-white`;
const VIEW_OFF = `${VIEW_BUTTON} text-ink hover:bg-paper`;

/**
 * Fetched the first time the map view renders, never before. If the chunk
 * itself cannot be fetched (offline, or a deploy replaced it), the student
 * gets the same "Map unavailable" as a failed Google script -- not the
 * route's error page in place of everything.
 */
const SessionMap = dynamic(
  () =>
    import("@/components/SessionMap").catch(() => ({
      default: function MapChunkFailed({ onShowList }: { onShowList?: () => void }) {
        return <MapUnavailable reason="load_failed" onShowList={onShowList} />;
      },
    })),
  { ssr: false, loading: MapLoading },
);

/** Stable key for a course chip -- matches formatCourseParam's halves. */
function courseKey(course: CourseFilter): string {
  return `${course.departmentCode}-${course.number}`;
}

export default function SessionBrowser({
  sessions,
  now,
  courseFilter = null,
  courses,
}: SessionBrowserProps) {
  const [filters, setFilters] = useState<SessionFilters>(NO_FILTERS);
  const searchId = useId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = sessionView(searchParams.get(VIEW_PARAM));
  const visible = useMemo(() => filterSessions(sessions, filters, now), [sessions, filters, now]);
  const groups = useMemo(() => groupByDay(visible, now), [visible, now]);

  // Courses the student can jump to. Derived from the loaded list, plus the
  // active filter so a course that matched nothing still shows as pressed
  // (otherwise there would be no chip to clear).
  const courseChips = useMemo(() => {
    const byKey = new Map<string, CourseFilter>();
    const available =
      courses ??
      sessions.map((session) => ({
        departmentCode: session.course.departmentCode,
        number: session.course.number,
      }));
    for (const course of available) {
      byKey.set(courseKey(course), course);
    }
    if (courseFilter) byKey.set(courseKey(courseFilter), courseFilter);
    return [...byKey.values()].sort(
      (a, b) =>
        a.departmentCode.localeCompare(b.departmentCode) || a.number.localeCompare(b.number),
    );
  }, [sessions, courseFilter, courses]);

  const showView = (next: SessionView) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "map") params.set(VIEW_PARAM, "map");
    else params.delete(VIEW_PARAM);
    const query = params.toString();
    // replaceState on purpose: a view toggle is not a history entry, and it
    // must not re-fetch. course= is already in searchParams, so it survives.
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  };

  const showCourse = (next: CourseFilter | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(COURSE_PARAM, formatCourseParam(next));
    else params.delete(COURSE_PARAM);
    const query = params.toString();
    // push, not replaceState: the server has to re-run listSessions() with
    // the new filter. view=map is already in searchParams, so it survives.
    router.push(query ? `/sessions?${query}` : "/sessions");
  };

  // Cold start only when nothing is filtered: a course that matched nothing
  // still has the filter chrome, so the student can clear it.
  if (sessions.length === 0 && !courseFilter) {
    return <EmptyState />;
  }

  const filtered = isFiltered(filters);
  const update = (change: Partial<SessionFilters>) => setFilters((f) => ({ ...f, ...change }));
  const activeCourseKey = courseFilter ? courseKey(courseFilter) : null;

  return (
    <div>
      {/* ---- Search and filters ------------------------------------------- */}
      <div role="search" className="mb-6 flex flex-col gap-3">
        <label htmlFor={searchId} className="sr-only">
          Search sessions
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2"
          />
          <input
            id={searchId}
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Search courses, topics or places"
            autoComplete="off"
            spellCheck={false}
            className="block h-12 min-h-11 w-full rounded-xl border border-field bg-white pr-4 pl-11 text-base text-ink placeholder:text-ink-2/80 focus:border-signal focus:ring-4 focus:ring-signal/15 focus:outline-none"
          />
        </div>
        {courseChips.length > 0 && (
          <div
            role="group"
            aria-label="Filter by course"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
          >
            <button
              type="button"
              aria-pressed={courseFilter === null}
              onClick={() => showCourse(null)}
              className={courseFilter === null ? CHIP_ON : CHIP_OFF}
            >
              All courses
            </button>
            {courseChips.map((course) => {
              const key = courseKey(course);
              const pressed = key === activeCourseKey;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => showCourse(course)}
                  className={pressed ? CHIP_ON : CHIP_OFF}
                >
                  {formatCourseCode(course)}
                </button>
              );
            })}
          </div>
        )}
        <div
          role="group"
          aria-label="Filter sessions"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0"
        >
          {WHEN_FILTERS.map((when) => (
            <button
              key={when}
              type="button"
              aria-pressed={filters.when === when}
              onClick={() => update({ when })}
              className={filters.when === when ? CHIP_ON : CHIP_OFF}
            >
              {WHEN_LABELS[when]}
            </button>
          ))}
          <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-line" />
          <button
            type="button"
            aria-pressed={filters.hasSeats}
            onClick={() => update({ hasSeats: !filters.hasSeats })}
            className={filters.hasSeats ? CHIP_ON : CHIP_OFF}
          >
            Has seats
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p aria-live="polite" className="text-sm text-ink-2">
            {courseFilter
              ? `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} for ${formatCourseCode(courseFilter)}`
              : filtered
                ? `Showing ${visible.length} of ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`
                : `${sessions.length} open ${sessions.length === 1 ? "session" : "sessions"}`}
            {(filtered || courseFilter) && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    setFilters(NO_FILTERS);
                    if (courseFilter) showCourse(null);
                  }}
                  className="inline-flex min-h-11 items-center font-semibold text-signal hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </p>
          <ViewToggle view={view} onChange={showView} />
        </div>
      </div>

      {/* ---- Results ------------------------------------------------------ */}
      {sessions.length === 0 && courseFilter ? (
        <NoCourseMatches course={courseFilter} onClear={() => showCourse(null)} />
      ) : visible.length === 0 ? (
        <NoMatches query={filters.query} onClear={() => setFilters(NO_FILTERS)} />
      ) : view === "map" ? (
        <MapView sessions={visible} now={now} onShowList={() => showView("list")} />
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-2 flex items-baseline justify-between gap-3 text-[17px] font-bold text-ink">
                {group.label}
                <span className="text-sm font-normal text-ink-2">
                  {group.sessions.length} {group.sessions.length === 1 ? "session" : "sessions"}
                </span>
              </h2>
              <ul className={`${PANEL} divide-y divide-line`} aria-label={`Study sessions, ${group.label}`}>
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} now={now} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
}: {
  view: SessionView;
  onChange: (view: SessionView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Show sessions as"
      className="inline-flex shrink-0 rounded-xl border border-line bg-white p-0.5"
    >
      <button
        type="button"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        className={view === "list" ? VIEW_ON : VIEW_OFF}
      >
        <Icon name="list" className="size-4" />
        List
      </button>
      <button
        type="button"
        aria-pressed={view === "map"}
        onClick={() => onChange("map")}
        className={view === "map" ? VIEW_ON : VIEW_OFF}
      >
        <Icon name="pin" className="size-4" />
        Map
      </button>
    </div>
  );
}

function MapView({
  sessions,
  now,
  onShowList,
}: {
  sessions: SessionListItem[];
  now: Date;
  onShowList: () => void;
}) {
  const apiKey = optionalGoogleMapsBrowserKey();
  if (!apiKey) {
    return <MapUnavailable reason="not_configured" onShowList={onShowList} />;
  }
  return <SessionMap sessions={sessions} now={now} apiKey={apiKey} onShowList={onShowList} />;
}

function MapLoading() {
  return (
    <div
      role="status"
      className={`${PANEL} ${MAP_HEIGHT} flex items-center justify-center text-[15px] text-ink-2`}
    >
      Loading the map…
    </div>
  );
}

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <section aria-labelledby="no-matches" className={`${PANEL} px-5 py-8 text-center`}>
      <h2 id="no-matches" className="text-[17px] font-bold text-ink">
        {query.trim() ? `No sessions for “${query.trim()}” yet` : "No sessions match these filters"}
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">
        Clear the filters, or host one yourself.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" onClick={onClear} className={BUTTON_SECONDARY}>
          Clear filters
        </button>
        <Link href="/sessions/new" className={BUTTON_PRIMARY}>
          Host a session
        </Link>
      </div>
    </section>
  );
}

function NoCourseMatches({
  course,
  onClear,
}: {
  course: CourseFilter;
  onClear: () => void;
}) {
  const label = formatCourseCode(course);
  return (
    <section aria-labelledby="no-course" className={`${PANEL} px-5 py-8 text-center`}>
      <h2 id="no-course" className="text-[17px] font-bold text-ink">
        No sessions for {label} yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">
        Clear the course filter to see everything, or host one yourself.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" onClick={onClear} className={BUTTON_SECONDARY}>
          Show all courses
        </button>
        <Link href="/sessions/new" className={BUTTON_PRIMARY}>
          Host a {label} session
        </Link>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section aria-labelledby="no-sessions" className={`${PANEL} px-5 py-10 text-center`}>
      <h2 id="no-sessions" className="text-[17px] font-bold text-ink">
        No study sessions yet
      </h2>
      <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">
        Studying something today? Start a session and classmates taking the
        same course can find you and join.
      </p>
      <Link href="/sessions/new" className={`${BUTTON_PRIMARY} mt-5`}>
        Host the first session
      </Link>
    </section>
  );
}
