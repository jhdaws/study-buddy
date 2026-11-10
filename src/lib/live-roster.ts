// Live roster: tell the session page when someone else joins or leaves
// (US-23, S6 follow-up), so "Who's going" and the seat count change while
// you watch instead of only on reload.
//
// This only says *that* the roster changed. It never applies the change
// itself: the caller re-fetches the page (router.refresh()), so what is shown
// is always what getSession() read from the database -- the seat count cannot
// drift from it, which is the point of showing one (see SessionRoster.tsx).
//
// How it listens -- Supabase Realtime "Postgres Changes" on session_attendees,
// which migration 20261026022048_live_roster.sql adds to the
// supabase_realtime publication:
//
//   - INSERT (a join) is filtered to this session by the server.
//   - DELETE (a leave) cannot be: Realtime does not filter DELETE events, so
//     every leave in every session arrives here and is matched on
//     `old.session_id`. That works because session_id is half of the table's
//     primary key, and the primary key is all a DELETE payload carries.
//   - Every time the channel reaches SUBSCRIBED -- the first time, and after
//     each reconnect -- it reports a change too. A join that landed between
//     the server render and the subscription, or while a phone was asleep,
//     would otherwise never show up.
//
// Realtime applies RLS as the signed-in student, so this sees exactly what
// getSession() may read: S1's session_attendees_select policy. That needs
// their token on the channel's FIRST join, which is why this waits for
// realtime.setAuth() before subscribing. Without the wait, a freshly loaded
// page joins before supabase-js has read the session cookie: the join goes
// out signed out, Realtime refuses the filtered subscription, and the token
// that arrives a moment later is never sent (observed in a real browser
// against a local stack; a Node client that signs in first hides it).
//
// Bursts are coalesced: one refresh per REFRESH_DELAY_MS, however many
// events arrive in it.

import type { SupabaseClient } from "@supabase/supabase-js";

/** How long to wait for more events before asking for one refresh. */
export const REFRESH_DELAY_MS = 250;

type RealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel" | "realtime">;

/**
 * Calls `onChange` (coalesced) whenever `sessionId`'s roster may have
 * changed. Returns a function that stops listening.
 */
export function subscribeToRoster(
  client: RealtimeClient,
  sessionId: string,
  onChange: () => void,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const changed = () => {
    if (stopped || timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      onChange();
    }, REFRESH_DELAY_MS);
  };

  const subscribe = () =>
    client
      .channel(`roster:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_attendees",
          filter: `session_id=eq.${sessionId}`,
        },
        changed,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "session_attendees" },
        (payload) => {
          // A payload without session_id would be a change in what Realtime
          // sends; refreshing is the safe reading of it.
          const leftFrom = (payload.old as { session_id?: string }).session_id;
          if (leftFrom === undefined || leftFrom === sessionId) changed();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") changed();
      });

  let channel: ReturnType<typeof subscribe> | undefined;

  // setAuth() with no token asks supabase-js for the session's. It only
  // rejects if that lookup itself throws; subscribing anyway then costs
  // nothing, and Realtime refuses it just as it would have.
  client.realtime
    .setAuth()
    .catch(() => undefined)
    .then(() => {
      if (!stopped) channel = subscribe();
    });

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (channel) void client.removeChannel(channel);
  };
}
