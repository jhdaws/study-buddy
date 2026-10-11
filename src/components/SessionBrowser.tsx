"use client";

/**
 * The session list with its search box and filter chips (US-03; a first,
 * client-side step towards US-06's course filter). Built by W5 (#12),
 * rebuilt to the Claude Design spec (page 2 "Filter chips", page 8 cards).
 *
 * Takes the SessionListItem[] that listSessions() returns (via the page),
 * already soonest first with ended and cancelled sessions dropped, and
 * filters and groups it in the browser (src/lib/session-filters.ts): search
 * by course, title, topic or place; chips for All / Happening now / Today /
 * This week; a Has seats toggle. Cards sit under day headings. Nothing is
 * re-fetched, so filtering is instant and works offline once loaded.
 *
 * A Client Component for the filter state. SessionCard has no hooks, so it
 * renders unchanged inside it. `now` comes from the server request, so the
 * day labels match what the server would print.
 *
 * The empty state recruits the visitor into hosting rather than saying
 * "nothing here": with no sessions, the only way the list fills is someone
 * starting one (the cold-start problem, US-16).
 *
 * Later:
 *   - List / map toggle (M4, #25, stretch). List stays the DEFAULT view, the
 *     map one tap away (ADR 0004): load <SessionMap> with next/dynamic
 *     (ssr: false) beside the list below; the filters apply to both.
 *   - Filtering by course across sessions not yet loaded (US-06) needs the
 *     query in listSessions(). The campus-zone filter (US-12) has no data to
 *     filter on now that there is no building list (ADR 0008).
 */

import Link from "next/link";
import { useId, useMemo, useState } from "react";

import SessionCard from "@/components/SessionCard";
import Icon from "@/components/ui/Icon";
import { BUTTON_PRIMARY, BUTTON_SECONDARY_LIGHT } from "@/components/ui/styles";
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
};

const CHIP =
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-bold whitespace-nowrap transition-colors";
const CHIP_ON = `${CHIP} border-navy-900 bg-navy-900 text-white`;
const CHIP_OFF = `${CHIP} border-navy-900/15 bg-white/70 text-navy-900 hover:bg-white`;

export default function SessionBrowser({ sessions, now }: SessionBrowserProps) {
  const [filters, setFilters] = useState<SessionFilters>(NO_FILTERS);
  const searchId = useId();
  const visible = useMemo(() => filterSessions(sessions, filters, now), [sessions, filters, now]);
  const groups = useMemo(() => groupByDay(visible, now), [visible, now]);

  if (sessions.length === 0) {
    return <EmptyState />;
  }

  const filtered = isFiltered(filters);
  const update = (change: Partial<SessionFilters>) => setFilters((f) => ({ ...f, ...change }));

  return (
    <div>
      {/* ---- Search and filters ------------------------------------------- */}
      <div role="search" className="mb-5 flex flex-col gap-3">
        <label htmlFor={searchId} className="sr-only">
          Search sessions
        </label>
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-navy-muted"
          />
          <input
            id={searchId}
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            placeholder="Search courses, topics or places"
            autoComplete="off"
            spellCheck={false}
            className="block h-14 min-h-11 w-full rounded-full border border-navy-900/10 bg-white/80 pr-5 pl-13 text-base text-navy-900 shadow-[0_10px_30px_-20px_rgba(10,26,54,0.6)] placeholder:text-navy-muted focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/20 focus:outline-none"
          />
        </div>
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
              {filters.when === when && <Icon name="check" className="size-4" />}
              {WHEN_LABELS[when]}
            </button>
          ))}
          <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-navy-900/15" />
          <button
            type="button"
            aria-pressed={filters.hasSeats}
            onClick={() => update({ hasSeats: !filters.hasSeats })}
            className={filters.hasSeats ? CHIP_ON : CHIP_OFF}
          >
            <Icon name={filters.hasSeats ? "check" : "seat"} className="size-4" />
            Has seats
          </button>
        </div>
        <p aria-live="polite" className="px-1 text-sm font-semibold text-navy-muted">
          {filtered
            ? `Showing ${visible.length} of ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`
            : `${sessions.length} open ${sessions.length === 1 ? "session" : "sessions"}`}
          {filtered && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="inline-flex min-h-11 items-center font-bold text-navy-900 underline underline-offset-4"
              >
                Clear filters
              </button>
            </>
          )}
        </p>
      </div>

      {/* ---- Results ------------------------------------------------------ */}
      {visible.length === 0 ? (
        <NoMatches query={filters.query} onClear={() => setFilters(NO_FILTERS)} />
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-3 flex items-center gap-3 px-1 text-sm font-extrabold tracking-wide text-navy-900 uppercase">
                {group.label}
                <span className="h-px flex-1 bg-navy-900/15" aria-hidden />
                <span className="font-semibold text-navy-muted normal-case">
                  {group.sessions.length} {group.sessions.length === 1 ? "session" : "sessions"}
                </span>
              </h2>
              <ul className="flex flex-col gap-4" aria-label={`Study sessions, ${group.label}`}>
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

function NoMatches({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <section
      aria-labelledby="no-matches"
      className="glass-light flex flex-col items-center rounded-card px-5 py-9 text-center text-navy-900"
    >
      <span aria-hidden className="grid size-14 place-items-center rounded-full bg-white/70">
        <Icon name="search" className="size-7" />
      </span>
      <h2 id="no-matches" className="mt-3 text-xl font-extrabold">
        {query.trim() ? `Nothing for “${query.trim()}” yet` : "No sessions match"}
      </h2>
      <p className="mt-1 max-w-sm text-base text-navy-900/80">
        Try fewer filters, or be the first to host one.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button type="button" onClick={onClear} className={BUTTON_SECONDARY_LIGHT}>
          Clear filters
        </button>
        <Link
          href="/sessions/new"
          className="inline-flex h-12 min-h-11 items-center justify-center gap-2 rounded-full bg-blue-600 px-6 text-base font-bold text-white hover:bg-navy-600"
        >
          <Icon name="plus" />
          Host a session
        </Link>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section
      aria-labelledby="no-sessions"
      className="glass-dark flex flex-col items-center rounded-card px-5 py-10 text-center text-white"
    >
      <span
        aria-hidden
        className="grid size-16 place-items-center rounded-full border border-white/15 bg-white/[0.08] text-blue-200"
      >
        <Icon name="calendar" className="size-8" />
      </span>
      <h2 id="no-sessions" className="mt-4 text-xl font-extrabold">
        No study sessions yet
      </h2>
      <p className="mt-2 max-w-sm text-base text-white/80">
        Studying something today? Start a session and classmates taking the
        same course can find you and join.
      </p>
      <Link href="/sessions/new" className={`${BUTTON_PRIMARY} mt-6`}>
        <Icon name="plus" />
        Host the first session
      </Link>
    </section>
  );
}
