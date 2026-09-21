/**
 * Session detail: roster, join/leave, and chat (US-04, US-05, US-23).
 *
 * TODO:
 *   - fetch the session, its attendee roster, and (for attendees) its messages
 *   - 404 when the session does not exist
 *   - render <SessionRoster> and <SessionChat>
 *   - show a clear notice when the host has cancelled
 *
 * Note: params is a Promise in this version of Next.js -- await it.
 */
export default function SessionDetailPage() {
  return (
    <main>
      <h1>Session</h1>
    </main>
  );
}
