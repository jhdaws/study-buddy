/**
 * In-session group chat (US-05).
 * Later sprint -- not part of Sprint 2 (docs/tickets.md, "Later sprints").
 *
 * TODO:
 *   - client component, subscribed to new messages for this session
 *   - de-duplicate by message id: the sender also receives their own insert
 *   - non-attendees see a prompt to join, not the message history
 *   - accessibility: role="log" + aria-live="polite" on the transcript
 *
 * Authorization belongs in the database, not here. A non-attendee subscribing
 * to this channel directly should receive nothing.
 */
export default function SessionChat() {
  return null;
}
