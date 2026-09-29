/**
 * Attendee roster, live seat count, and the join/leave button
 * (US-04, US-07, US-08, US-23).
 * Later sprint -- not part of Sprint 2 (docs/tickets.md, "Later sprints").
 *
 * TODO:
 *   - client component, subscribed to roster changes for this session
 *   - on a change, refetch rather than applying the payload by hand: a little
 *     chattier, but it cannot drift out of sync with the database, which is
 *     the entire point of showing a seat count
 *   - disable the join button at capacity and surface a clear reason
 *   - host sees a "you're hosting" state instead of a join button
 */
export default function SessionRoster() {
  return null;
}
