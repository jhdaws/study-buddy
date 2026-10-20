"use client";

/**
 * The Sessions page body (US-03), from the 2026-10-20 redesign:
 *
 *   view tabs   List (by day), Board (Happening now / Today / Tomorrow /
 *               Later this week -- no drag and drop: students cannot move a
 *               session), Calendar (this week, 8 AM to midnight)
 *   filter row  search, pills (All, Happening now, Today, This week, Has
 *               seats), and a Filter popover with Course and Place
 *
 * Everything filters the list the page already loaded (src/lib/
 * session-filters.ts, unit tested). `?q=` (the top bar's search), `?course=`
 * (the sidebar's Courses) and `?view=` set the starting state.
 */

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import SessionCard from "@/components/SessionCard";
import Icon from "@/components/ui/Icon";
import { ViewTabs } from "@/components/ui/PageHeader";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FILTER_PILL, SELECT } from "@/components/ui/styles";
import { departmentColours } from "@/lib/departments";
import { formatCourseCode, formatSessionCount } from "@/lib/format";
import {
  filterOptions,
  filterSessions,
  groupByDay,
  isFiltered,
  NO_FILTERS,
  popoverFilterCount,
  type SessionFilters,
  WHEN_FILTERS,
  WHEN_LABELS,
} from "@/lib/session-filters";
import {
  boardColumn,
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  calendarSlot,
  campusClock,
  sessionStatus,
} from "@/lib/session-view";
import type { SessionListItem } from "@/lib/sessions";

export type SessionView = "list" | "board" | "calendar";

const VIEWS: { key: SessionView; label: string; icon: "list" | "board" | "calendar" }[] = [
  { key: "list", label: "List", icon: "list" },
  { key: "board", label: "Board", icon: "board" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
];

export type SessionBrowserProps = {
  sessions: SessionListItem[];
  now: Date;
  viewerId?: string | null;
  initialQuery?: string;
  initialCourse?: string;
  initialView?: SessionView;
};

export default function SessionBrowser({
  sessions,
  now,
  viewerId,
  initialQuery = "",
  initialCourse = "",
  initialView = "list",
}: SessionBrowserProps) {
  const [view, setView] = useState<SessionView>(initialView);
  const [filters, setFilters] = useState<SessionFilters>({
    ...NO_FILTERS,
    query: initialQuery,
    course: initialCourse,
  });

  // The sidebar's Courses and the top bar's search change the URL while this
  // page stays mounted; follow them.
  const [seen, setSeen] = useState({ initialQuery, initialCourse });
  if (seen.initialQuery !== initialQuery || seen.initialCourse !== initialCourse) {
    setSeen({ initialQuery, initialCourse });
    setFilters((f) => ({ ...f, query: initialQuery, course: initialCourse }));
  }

  const shown = useMemo(() => filterSessions(sessions, filters, now), [sessions, filters, now]);
  const options = useMemo(() => filterOptions(sessions), [sessions]);
  const filtered = isFiltered(filters);

  return (
    <>
      <ViewTabs label="Session views" tabs={VIEWS} current={view} onChange={setView} />

      <FilterRow filters={filters} setFilters={setFilters} options={options} />

      <p className="sr-only" aria-live="polite">
        {formatSessionCount(shown.length)} shown
      </p>

      {sessions.length === 0 ? (
        <EmptyState />
      ) : shown.length === 0 ? (
        <NoMatches filters={filters} onClear={() => setFilters(NO_FILTERS)} />
      ) : view === "list" ? (
        <ListView sessions={shown} now={now} viewerId={viewerId} />
      ) : view === "board" ? (
        <BoardView sessions={shown} now={now} viewerId={viewerId} />
      ) : (
        <CalendarView sessions={shown} now={now} />
      )}

      {filtered && shown.length > 0 && (
        <p className="mt-4 text-[13px] text-ink-2">
          Showing {shown.length} of {sessions.length}.{" "}
          <button type="button" onClick={() => setFilters(NO_FILTERS)} className="font-medium text-accent hover:underline">
            Clear filters
          </button>
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function FilterRow({
  filters,
  setFilters,
  options,
}: {
  filters: SessionFilters;
  setFilters: React.Dispatch<React.SetStateAction<SessionFilters>>;
  options: { courses: string[]; places: string[] };
}) {
  const [open, setOpen] = useState(false);
  const count = popoverFilterCount(filters);
  const popId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
      <label className="order-1 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-ink-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent lg:h-8 lg:max-w-[260px]">
        <Icon name="search" />
        <input
          type="search"
          aria-label="Filter sessions"
          value={filters.query}
          onChange={(event) => setFilters((f) => ({ ...f, query: event.target.value }))}
          placeholder="Search sessions, courses, places"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 lg:text-[13px]"
        />
      </label>

      <div role="group" aria-label="When" className="order-3 flex w-full gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] lg:order-2 lg:w-auto lg:flex-wrap lg:overflow-visible lg:pb-0">
        {WHEN_FILTERS.map((when) => (
          <button
            key={when}
            type="button"
            aria-pressed={filters.when === when}
            onClick={() => setFilters((f) => ({ ...f, when }))}
            className={`${FILTER_PILL} shrink-0`}
          >
            {WHEN_LABELS[when]}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={filters.hasSeats}
          onClick={() => setFilters((f) => ({ ...f, hasSeats: !f.hasSeats }))}
          className={`${FILTER_PILL} shrink-0`}
        >
          Has seats
        </button>
      </div>

      <div ref={wrapRef} className="relative order-2 lg:order-3 lg:ml-auto">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? popId : undefined}
          onClick={() => setOpen((v) => !v)}
          className={`${FILTER_PILL} ${count ? "border-accent text-accent" : ""}`}
        >
          <Icon name="filter" />
          {count ? `Filter (${count})` : "Filter"}
        </button>
        {open && (
          <div
            id={popId}
            role="dialog"
            aria-label="Filters"
            className="absolute top-[calc(100%+6px)] right-0 z-30 flex w-[min(320px,calc(100vw-32px))] flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-[0_12px_32px_rgba(17,24,39,0.10)]"
          >
            <p className="text-[15px] font-semibold text-ink">Filters</p>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Course
              <select
                value={filters.course ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, course: event.target.value }))}
                className={SELECT}
              >
                <option value="">Any course</option>
                {options.courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink">
              Place
              <select
                value={filters.place ?? ""}
                onChange={(event) => setFilters((f) => ({ ...f, place: event.target.value }))}
                className={SELECT}
              >
                <option value="">Anywhere</option>
                {options.places.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, course: "", place: "" }))}
                className="text-[13px] font-medium text-ink-2 hover:text-ink"
              >
                Clear
              </button>
              <button type="button" onClick={() => setOpen(false)} className={BUTTON_SECONDARY}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** A day heading on the frosted strip, with the day's count on the right. */
function DayHeading({ id, label, count }: { id?: string; label: string; count: number }) {
  return (
    <div className="glass mb-2 flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5">
      <h2 id={id} className="text-xs font-semibold text-[#374151]">
        {label}
      </h2>
      <span className="text-xs text-ink-2">{formatSessionCount(count)}</span>
    </div>
  );
}

function ListView({ sessions, now, viewerId }: { sessions: SessionListItem[]; now: Date; viewerId?: string | null }) {
  const groups = groupByDay(sessions, now);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group, i) => (
        <section key={group.label} aria-labelledby={`day-${i}`}>
          <DayHeading id={`day-${i}`} label={group.label} count={group.sessions.length} />
          <ul className="flex flex-col gap-3">
            {group.sessions.map((session) => (
              <li key={session.id}>
                <SessionCard session={session} now={now} viewerId={viewerId} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const COLUMNS = [
  { key: "now", label: "Happening now" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "later", label: "Later this week" },
] as const;

function BoardView({ sessions, now, viewerId }: { sessions: SessionListItem[]; now: Date; viewerId?: string | null }) {
  const byColumn = new Map<string, SessionListItem[]>(COLUMNS.map((c) => [c.key, []]));
  for (const session of sessions) byColumn.get(boardColumn(session.startsAt, session.endsAt, now))?.push(session);
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
      {COLUMNS.map((column) => {
        const items = byColumn.get(column.key) ?? [];
        return (
          <section
            key={column.key}
            aria-labelledby={`col-${column.key}`}
            className="flex w-[300px] shrink-0 snap-start flex-col gap-2 rounded-xl border border-[rgba(17,24,39,0.06)] bg-white/50 p-2 backdrop-blur-[16px] lg:w-auto lg:min-w-0 lg:flex-1"
          >
            <div className="flex items-center justify-between px-1.5 pt-1">
              <h2 id={`col-${column.key}`} className="text-[13px] font-semibold text-ink">
                {column.label}
              </h2>
              <span className="rounded-md bg-white px-1.5 text-xs font-medium text-ink-2">{items.length}</span>
            </div>
            {items.length === 0 ? (
              <p className="px-1.5 py-3 text-xs text-ink-2">Nothing here yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} now={now} viewerId={viewerId} showDay={column.key === "later"} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

const HOUR_PX = 44;
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function CalendarView({ sessions, now }: { sessions: SessionListItem[]; now: Date }) {
  const today = campusClock(now).weekday;
  const [phoneDay, setPhoneDay] = useState(today);
  const hours = Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR }, (_, i) => CALENDAR_START_HOUR + i);
  // Day-of-month labels for this campus week.
  const dayNumbers = DAY_NAMES.map((_, i) => {
    const d = new Date(now.getTime() + (i - today) * 86_400_000);
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", day: "numeric" }).format(d);
  });
  const blocks = sessions
    .map((session) => ({ session, slot: calendarSlot(session.startsAt, session.endsAt, now) }))
    .filter((b): b is { session: SessionListItem; slot: NonNullable<ReturnType<typeof calendarSlot>> } => b.slot !== null);
  const nowLine = campusClock(now).minutes - CALENDAR_START_HOUR * 60;

  const grid = (days: number[]) => (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
        <span />
        {days.map((d) => (
          <span key={d} className="flex items-center gap-1.5 border-l border-line px-2 py-2 text-xs text-ink-2">
            {DAY_NAMES[d]}
            <span
              className={`inline-flex size-6 items-center justify-center rounded-md text-[13px] font-semibold ${
                d === today ? "bg-dark text-white" : "text-ink"
              }`}
            >
              {dayNumbers[d]}
            </span>
          </span>
        ))}
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(0,1fr))` }}>
        <div>
          {hours.map((h) => (
            <div key={h} className="pr-2 text-right text-[11px] text-ink-2" style={{ height: HOUR_PX }}>
              {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div key={d} className="relative overflow-hidden border-l border-line">
            {hours.map((h) => (
              <div key={h} className="border-b border-line/70" style={{ height: HOUR_PX }} />
            ))}
            {d === today && nowLine > 0 && nowLine < (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60 && (
              <div aria-hidden className="absolute inset-x-0 z-10 h-0.5 bg-dark" style={{ top: (nowLine / 60) * HOUR_PX }}>
                <span className="absolute -top-[3px] -left-1 size-2 rounded-full bg-dark" />
              </div>
            )}
            {blocks
              .filter((b) => b.slot.column === d)
              .map(({ session, slot }) => {
                const [a, b] = departmentColours(session.course.departmentCode).gradient;
                const status = sessionStatus(session, now);
                return (
                  <Link
                    key={session.id}
                    href={`/sessions/${session.id}`}
                    className="absolute inset-x-1 overflow-hidden rounded-md border border-[rgba(17,24,39,0.08)] px-1.5 py-1 text-[11px] leading-tight text-ink hover:border-line-strong"
                    style={{
                      top: (slot.top / 60) * HOUR_PX + 1,
                      height: (slot.height / 60) * HOUR_PX - 2,
                      background: status === "full" ? "#F1F2F4" : `linear-gradient(135deg, ${a}, ${b})`,
                    }}
                  >
                    <span className="block truncate font-semibold">{formatCourseCode(session.course)}</span>
                    <span className="line-clamp-2">{session.topic}</span>
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className="hidden lg:block">{grid([0, 1, 2, 3, 4, 5, 6])}</div>
      <div className="lg:hidden">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous day"
            disabled={phoneDay === 0}
            onClick={() => setPhoneDay((d) => Math.max(0, d - 1))}
            className="flex size-11 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40"
          >
            <Icon name="chevLeft" />
          </button>
          <span className="text-sm font-semibold">
            {DAY_NAMES[phoneDay]} {dayNumbers[phoneDay]}
          </span>
          <button
            type="button"
            aria-label="Next day"
            disabled={phoneDay === 6}
            onClick={() => setPhoneDay((d) => Math.min(6, d + 1))}
            className="flex size-11 items-center justify-center rounded-lg border border-line bg-white disabled:opacity-40"
          >
            <Icon name="chevRight" />
          </button>
        </div>
        {grid([phoneDay])}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Empty and no-match states
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <section
      aria-labelledby="sessions-empty"
      className="flex flex-col items-center gap-4 rounded-2xl border border-[rgba(17,24,39,0.06)] bg-white bg-cover bg-center px-6 py-16 text-center"
      style={{ backgroundImage: "url(/bg/bg-blue-wide.webp)" }}
    >
      <TableIllustration />
      <h2 id="sessions-empty" className="text-[15px] font-semibold text-ink">
        No study sessions yet
      </h2>
      <p className="max-w-sm text-sm text-ink-body">Be the first. Pick a course, a place and a time.</p>
      <Link href="/sessions/new" className={BUTTON_PRIMARY}>
        Host the first session
      </Link>
    </section>
  );
}

function NoMatches({ filters, onClear }: { filters: SessionFilters; onClear: () => void }) {
  const q = filters.query.trim();
  return (
    <section aria-labelledby="sessions-none" className="rounded-xl border border-line bg-white px-6 py-10 text-center">
      <h2 id="sessions-none" className="text-[15px] font-semibold text-ink">
        {q ? `No sessions for “${q}” yet` : "No sessions match these filters"}
      </h2>
      <p className="mt-1 text-sm text-ink-body">
        <button type="button" onClick={onClear} className="font-medium text-accent hover:underline">
          Clear filters
        </button>{" "}
        or{" "}
        <Link href="/sessions/new" className="font-medium text-accent hover:underline">
          host it
        </Link>
        .
      </p>
    </section>
  );
}

/** Two chairs at a table, as a line drawing, for empty states. */
export function TableIllustration() {
  return (
    <svg viewBox="0 0 200 120" className="h-[110px] w-[180px]" aria-hidden fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M40 58h120M52 58v42M148 58v42" />
      <path d="M72 50c0-6 4-10 10-10h36c6 0 10 4 10 10" opacity=".35" />
      <path d="M18 40v30h22M18 70v30M40 70v30" />
      <path d="M182 40v30h-22M182 70v30M160 70v30" />
      <rect x="86" y="44" width="28" height="14" rx="2" fill="#E8F0FE" stroke="#2F5BEA" />
    </svg>
  );
}

