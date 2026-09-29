/**
 * Browse study sessions (US-03).
 *
 * TODO (W5, #12):
 *   - `await listSessions()` from src/lib/sessions.ts -- open sessions that
 *     have not ended, soonest first, with seats left already derived. It is
 *     a W4 stub returning fixtures until S4 (#21) lands; this page does not
 *     change when it does.
 *   - Render <SessionBrowser> with them.
 *   - Handle the load-failure case without a blank screen.
 *
 * Filters (US-06 course, US-12 campus zone) and the map (M4) come later; see
 * the comment in SessionBrowser.tsx.
 */
export default function SessionsPage() {
  return (
    <main>
      <h1>Study sessions</h1>
    </main>
  );
}
