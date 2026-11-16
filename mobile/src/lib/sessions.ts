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
  return items;
}

const dayFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  weekday: "short",
  month: "short",
  day: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

/** "Mon, Nov 16 · 7:00 PM – 9:00 PM", in campus time. */
export function formatWhen(startsAt: Date, endsAt: Date): string {
  return `${dayFormat.format(startsAt)} · ${timeFormat.format(startsAt)} – ${timeFormat.format(endsAt)}`;
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
