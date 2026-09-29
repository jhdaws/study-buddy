/**
 * Map of upcoming sessions (US-03). M4 (#25) -- stretch, only once M1-M3 are
 * done.
 *
 * TODO (M4):
 *   - Client component, Google Maps JavaScript API with the browser key
 *     (ADR 0007, as amended by ADR 0008); @vis.gl/react-google-maps is
 *     already a dependency. Load it client-side only: the Maps API needs a
 *     browser, and deferring it keeps a sizeable script out of the first load.
 *   - One marker per session, visually distinct when `seatsLeft === 0`.
 *   - Info window: course, topic, location label, seats left, and a link
 *     through.
 *   - Markers sit at the coordinates resolvePlace() validated and stored in
 *     `locations` -- one source, Google Places; there are no curated
 *     buildings. SessionListItem (src/lib/sessions.ts) has no coordinates
 *     yet: add `lat`/`lng` to it in M4 -- adding a field breaks no caller.
 */
export default function SessionMap() {
  return null;
}
