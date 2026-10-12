// Filtering and grouping for the session list's search box and chips
// (SessionBrowser). Pure and client-safe; unit tested in
// session-filters.test.ts. Works on the SessionListItem[] the page already
// has -- no extra query -- so it filters what listSessions() returned.
//
// Day boundaries are campus days (America/Chicago), like every time shown in
// the app: "Today" means today in Nashville, whatever the device's zone.

import { campusDayOffset, formatCampusDay, formatCourseCode, isInProgress } from "@/lib/format";
import type { SessionListItem } from "@/lib/sessions";

export const WHEN_FILTERS = ["all", "now", "today", "week"] as const;
export type WhenFilter = (typeof WHEN_FILTERS)[number];

export const WHEN_LABELS: Record<WhenFilter, string> = {
  all: "All",
  now: "Happening now",
  today: "Today",
  week: "This week",
};

export type SessionFilters = {
  /** Free text matched against course code and title, topic and place. */
  query: string;
  when: WhenFilter;
  /** Only sessions with at least one seat left. */
  hasSeats: boolean;
};

export const NO_FILTERS: SessionFilters = { query: "", when: "all", hasSeats: false };

/**
 * Lower-case, accents dropped, punctuation turned into spaces: "C.S. 3251" ->
 * "c s 3251". Matching is by substring, so "c" and "s" still find "cs".
 */
function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function haystack(session: SessionListItem): string {
  const { course } = session;
  return normalise(
    [
      formatCourseCode(course),
      // "CS3251" as well as "CS 3251", so either spelling finds it.
      `${course.departmentCode}${course.number}`,
      course.title ?? "",
      session.topic,
      session.locationLabel,
      session.room ?? "",
    ].join(" "),
  );
}

function matchesWhen(session: SessionListItem, when: WhenFilter, now: Date): boolean {
  if (when === "all") return true;
  const live = isInProgress(session.startsAt, session.endsAt, now);
  if (when === "now") return live;
  const offset = campusDayOffset(new Date(session.startsAt), now);
  // A session that started yesterday and is still running counts as today's.
  if (when === "today") return offset === 0 || live;
  return offset < 7 || live; // "week": today and the next six days
}

/** The sessions that pass every filter, in the order given. */
export function filterSessions(
  sessions: SessionListItem[],
  filters: SessionFilters,
  now: Date,
): SessionListItem[] {
  // Every word must appear somewhere, in any order: "linear 2410" works.
  const words = normalise(filters.query).split(" ").filter(Boolean);
  return sessions.filter(
    (session) =>
      (!filters.hasSeats || session.seatsLeft > 0) &&
      matchesWhen(session, filters.when, now) &&
      (words.length === 0 || words.every((word) => haystack(session).includes(word))),
  );
}

export function isFiltered(filters: SessionFilters): boolean {
  return filters.query.trim() !== "" || filters.when !== "all" || filters.hasSeats;
}

export type DayGroup = { label: string; sessions: SessionListItem[] };

/**
 * Consecutive sessions grouped under "Today", "Tomorrow", "Tue, Oct 13" by
 * their start's campus day. Input is already soonest-first, so each day
 * appears once. A session still running from yesterday is grouped as today.
 */
export function groupByDay(sessions: SessionListItem[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const session of sessions) {
    const start = new Date(session.startsAt);
    const label =
      campusDayOffset(start, now) < 0 && isInProgress(session.startsAt, session.endsAt, now)
        ? "Today"
        : formatCampusDay(start, now);
    const last = groups.at(-1);
    if (last && last.label === label) last.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  }
  return groups;
}
