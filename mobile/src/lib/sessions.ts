// The open-session list for the mobile app (US-03). The query mirrors the
// web app's listSessions() (src/lib/sessions.ts at the repo root): open
// sessions that have not ended, soonest first, the roster counted by
// Postgres, and sessions hosted by someone the viewer blocked left out
// (US-22). RLS decides what a signed-in student may read; this only shapes it.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Campus time: every session time is shown in Nashville's zone. */
export const CAMPUS_TIME_ZONE = "America/Chicago";

export const SESSION_LIST_SELECT = `id, topic, location_label, room, starts_at, ends_at, capacity, host_id, status,
       courses!inner (department_code, number, title),
       profiles!sessions_host_id_fkey (display_name),
       session_attendees (count)`;

export type SessionRow = {
  id: string;
  topic: string;
  location_label: string;
  room: string | null;
  starts_at: string;
  ends_at: string;
  capacity: number;
  host_id: string | null;
  status: "open" | "cancelled";
  courses: { department_code: string; number: string; title: string | null } | null;
  profiles: { display_name: string | null } | null;
  session_attendees: { count: number }[] | null;
};

export type SessionItem = {
  id: string;
  course: string;
  courseTitle: string | null;
  topic: string;
  place: string;
  host: string;
  startsAt: Date;
  endsAt: Date;
  going: number;
  capacity: number;
  seatsLeft: number;
};

/** Seats left, never below zero (a capacity can be lowered under a full roster). */
export function seatsLeft(going: number, capacity: number): number {
  return Math.max(0, capacity - going);
}

export function seatsText(item: Pick<SessionItem, "seatsLeft">): string {
  if (item.seatsLeft === 0) return "Full";
  return item.seatsLeft === 1 ? "1 seat left" : `${item.seatsLeft} seats left`;
}

/** One list row from one database row; blocked hosts and broken rows are dropped. */
export function toSessionItems(rows: SessionRow[], blockedIds: ReadonlySet<string>): SessionItem[] {
  const items: SessionItem[] = [];
  for (const row of rows) {
    if (row.host_id && blockedIds.has(row.host_id)) continue;
    if (!row.courses) continue;
    const startsAt = new Date(row.starts_at);
    const endsAt = new Date(row.ends_at);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) continue;
    const going = row.session_attendees?.[0]?.count ?? 0;
    items.push({
      id: row.id,
      course: `${row.courses.department_code} ${row.courses.number}`,
      courseTitle: row.courses.title,
      topic: row.topic,
      place: row.room ? `${row.location_label}, ${row.room}` : row.location_label,
      host: row.profiles?.display_name ?? "Deleted user",
      startsAt,
      endsAt,
      going,
      capacity: row.capacity,
      seatsLeft: seatsLeft(going, row.capacity),
    });
  }
  // Soonest first even if the server's order is lost, so day headings never repeat.
  return items.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
}

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayParts = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

const DAY_MS = 86_400_000;

/** A whole-day number for `date`'s campus calendar day. */
function campusDay(date: Date): number {
  const parts = dayParts.formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

/** "7:00 PM", in campus time. Some engines put a narrow space before AM/PM; it is normalised. */
export function formatTime(date: Date): string {
  return timeFormat.format(date).replace(/\u202f/g, " ");
}

/** "Today", "Tomorrow", or "Thu, Nov 19", by campus calendar day (the web's formatCampusDay). */
export function formatCampusDay(date: Date, now: Date): string {
  const offset = campusDay(date) - campusDay(now);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  return dateFormat.format(date);
}

/** "Mon, Nov 16 · 7:00 PM – 9:00 PM", in campus time (accessibility labels). */
export function formatWhen(startsAt: Date, endsAt: Date): string {
  return `${dateFormat.format(startsAt)} · ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

export function isInProgress(item: Pick<SessionItem, "startsAt" | "endsAt">, now: Date): boolean {
  return item.startsAt.getTime() <= now.getTime() && now.getTime() < item.endsAt.getTime();
}

export type DayGroup = { title: string; data: SessionItem[] };

/**
 * Sessions under day headings, in the order given (soonest first), as on the
 * web list. One that started yesterday and is still running counts as Today.
 */
export function groupByDay(items: SessionItem[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const startedEarlier = campusDay(item.startsAt) < campusDay(now);
    const title = startedEarlier && isInProgress(item, now) ? "Today" : formatCampusDay(item.startsAt, now);
    const last = groups.at(-1);
    if (last && last.title === title) last.data.push(item);
    else groups.push({ title, data: [item] });
  }
  return groups;
}

/** Read the list as the signed-in student. Throws on a failed read. */
export async function listOpenSessions(supabase: SupabaseClient): Promise<SessionItem[]> {
  const [blocks, sessions] = await Promise.all([
    supabase.from("blocks").select("blocked_id"),
    supabase
      .from("sessions")
      .select(SESSION_LIST_SELECT)
      .eq("status", "open")
      .gt("ends_at", "now")
      .order("starts_at", { ascending: true }),
  ]);
  if (sessions.error) {
    // The detail goes to the developer console, never to the student.
    console.warn("listOpenSessions failed", sessions.error.code);
    throw new Error("Could not load sessions.");
  }
  const blockedIds = new Set(
    (blocks.data ?? []).map((row: { blocked_id: string }) => row.blocked_id),
  );
  return toSessionItems((sessions.data ?? []) as unknown as SessionRow[], blockedIds);
}
