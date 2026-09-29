/**
 * The session list, and later its map toggle and filters (US-03; US-06 and
 * US-12 later).
 *
 * TODO (W5, #12 -- Sprint 2):
 *   - Takes the SessionListItem[] that listSessions() returns
 *     (src/lib/sessions.ts, via the page) and renders one card each: course
 *     (code, number, title if any), topic, location label, room if any, start
 *     and end, seats left. `seatsLeft === 0` gets the "Full" treatment.
 *   - Times are UTC ISO strings: format with an explicit
 *     `timeZone: "America/Chicago"` if this renders on the server.
 *   - The empty state recruits the visitor into hosting, not just "nothing
 *     here" (the cold-start problem, US-16).
 *   - A Server Component is enough for the list alone.
 *
 * Later:
 *   - List / map toggle (M4, #25, stretch): list is the DEFAULT view, map one
 *     tap away (ADR 0004). That makes this a client component, and
 *     <SessionMap> must load client-side only.
 *   - Course filter (US-06). The campus-zone filter (US-12) has no data to
 *     filter on now that there is no building list (ADR 0008) -- rethink it
 *     before building it.
 */
export default function SessionBrowser() {
  return null;
}
