// The session map's pins (M4, US-03): the SessionListItem[] the list already
// has, turned into what <SessionMap> draws. Pure and client-safe, so it is
// unit tested here (session-map.test.ts) without Google, and the component
// is left with nothing to decide.
//
// ONE PIN PER PLACE, NOT PER SESSION. Two sessions at the same `locations`
// row have exactly the same coordinates, so two markers would sit on top of
// each other and only the top one could ever be tapped. Central Library will
// often have several. Sessions at one spot share a pin, and its info window
// lists every one of them; a place with a single session is the ordinary
// one-marker-per-session case.
//
// Times are campus time and seats are derived exactly as the list shows them
// (src/lib/format.ts), so the map and the list never disagree.

import { formatCourseCode, formatSeatsLeft, formatSessionTime } from "@/lib/format";
import { isValidLatLng, type LatLng } from "@/lib/geo";
import type { SessionListItem } from "@/lib/sessions";

// ---------------------------------------------------------------------------
// The List / Map toggle's URL state
// ---------------------------------------------------------------------------

/** The two ways /sessions shows its sessions. The list is the default (ADR 0004). */
export type SessionView = "list" | "map";

/** The query parameter the toggle writes: `/sessions?view=map`. */
export const VIEW_PARAM = "view";

/** The view a `?view=` value asks for. Anything but `map` is the list. */
export function sessionView(param: string | null | undefined): SessionView {
  return param === "map" ? "map" : "list";
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

/** One session, as a pin's info window lists it. */
export type MapSession = {
  id: string;
  /** The session page (S6). */
  href: string;
  /** `CS 3251` */
  courseCode: string;
  /** Null when no one has named the course (ADR 0006). */
  courseTitle: string | null;
  topic: string;
  /** For `<time dateTime>`. */
  startsAt: string;
  /** `Today · 2:00 – 4:00 PM`, in campus time. */
  time: string;
  /** 0 means full, as in SessionListItem. */
  seatsLeft: number;
  /**
   * What to print under the pin's heading about where, or null for nothing:
   * the room, or -- when the host named the place differently from the
   * pin's heading -- their own label, with the room.
   */
  where: string | null;
};

/** One marker: every open session at one spot. */
export type SessionPin = {
  /** The spot, rounded to about a metre. Stable while the sessions are: a React key. */
  key: string;
  position: LatLng;
  /** The pin's heading: the first session's place, as its host named it. */
  label: string;
  /** Soonest first, the order the list arrives in. */
  sessions: MapSession[];
  /** No session here has a seat left: the pin gets the "Full" look. */
  full: boolean;
  /**
   * The marker's accessible name, which a screen reader announces when the
   * marker takes keyboard focus: `CS 3251 at Featheringill Hall, 2 seats
   * left`, or `2 sessions at Central Library, 1 full`.
   */
  title: string;
};

/** 5 decimal places of a degree is about 1.1 m of latitude. */
const KEY_DECIMALS = 5;

function spotKey({ lat, lng }: LatLng): string {
  return `${lat.toFixed(KEY_DECIMALS)},${lng.toFixed(KEY_DECIMALS)}`;
}

function where(session: SessionListItem, label: string): string | null {
  if (session.locationLabel === label) return session.room;
  return session.room ? `${session.locationLabel}, ${session.room}` : session.locationLabel;
}

function pinTitle(label: string, sessions: SessionListItem[]): string {
  if (sessions.length === 1) {
    const [only] = sessions;
    return `${formatCourseCode(only.course)} at ${label}, ${formatSeatsLeft(only.seatsLeft)}`;
  }
  const full = sessions.filter((session) => session.seatsLeft <= 0).length;
  const fullNote = full === 0 ? "" : full === sessions.length ? ", all full" : `, ${full} full`;
  return `${sessions.length} sessions at ${label}${fullNote}`;
}

/**
 * The map's pins for `sessions`, one per spot, in the order of each spot's
 * soonest session.
 *
 * A session without real coordinates (NaN, or off the globe) is left off the
 * map -- never pinned at 0, 0 -- and stays in the list. listSessions() never
 * returns one; this is the map's half of failing safe.
 */
export function sessionPins(sessions: SessionListItem[], now: Date): SessionPin[] {
  const spots = new Map<string, SessionListItem[]>();
  for (const session of sessions) {
    const position = { lat: session.lat, lng: session.lng };
    if (!isValidLatLng(position)) continue;
    const key = spotKey(position);
    const here = spots.get(key);
    if (here) here.push(session);
    else spots.set(key, [session]);
  }

  return [...spots].map(([key, here]) => {
    const [first] = here;
    const label = first.locationLabel;
    return {
      key,
      position: { lat: first.lat, lng: first.lng },
      label,
      sessions: here.map((session) => ({
        id: session.id,
        href: `/sessions/${session.id}`,
        courseCode: formatCourseCode(session.course),
        courseTitle: session.course.title,
        topic: session.topic,
        startsAt: session.startsAt,
        time: formatSessionTime(session.startsAt, session.endsAt, now),
        seatsLeft: session.seatsLeft,
        where: where(session, label),
      })),
      full: here.every((session) => session.seatsLeft <= 0),
      title: pinTitle(label, here),
    };
  });
}
