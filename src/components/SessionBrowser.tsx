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
import { BUTTON_PRIMARY, BUTTON_SECONDARY, PANEL } from "@/components/ui/styles";
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
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold whitespace-nowrap transition-colors";
const CHIP_ON = `${CHIP} border-brand bg-brand text-white`;
const CHIP_OFF = `${CHIP} border-line bg-white text-ink hover:border-field`;

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
        <p aria-live="polite" className="text-sm text-ink-2">
          {filtered
            ? `Showing ${visible.length} of ${sessions.length} ${sessions.length === 1 ? "session" : "sessions"}`
            : `${sessions.length} open ${sessions.length === 1 ? "session" : "sessions"}`}
          {filtered && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setFilters(NO_FILTERS)}
                className="inline-flex min-h-11 items-center font-semibold text-signal hover:underline"
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
