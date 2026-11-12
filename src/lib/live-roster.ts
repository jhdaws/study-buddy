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
//
// The session chat (US-05) listens the same way -- subscribeToChat() below,
// on its own channel -- and shares all of the above through listen().

import type { SupabaseClient } from "@supabase/supabase-js";

/** How long to wait for more events before asking for one refresh. */
export const REFRESH_DELAY_MS = 250;

type RealtimeClient = Pick<SupabaseClient, "channel" | "removeChannel" | "realtime">;
type Channel = ReturnType<SupabaseClient["channel"]>;

/**
 * Calls `onChange` (coalesced) whenever `sessionId`'s roster may have
 * changed. Returns a function that stops listening.
 */
export function subscribeToRoster(
  client: RealtimeClient,
  sessionId: string,
  onChange: () => void,
): () => void {
  return listen(client, `roster:${sessionId}`, onChange, (channel, changed) =>
    channel
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
      ),
  );
}

/**
 * Session chat (US-05): calls `onChange` (coalesced) whenever someone posts
 * in `sessionId`'s chat, and on each (re)subscribe. Same contract as
 * subscribeToRoster(): it says only *that* there is something new, and the
 * caller re-fetches, so the transcript on screen is always listMessages()'s
 * -- no payload to de-duplicate against the sender's own post, and nothing
 * to reorder.
 *
 * Only INSERTs: nobody can edit or delete a message (*_session_chat.sql).
 * Realtime checks session_messages_select_attendees as this student before
 * sending each one, so a non-attendee who subscribes anyway hears nothing
 * (US-05b) -- which is why the token must be on the first join (above).
 */
export function subscribeToChat(
  client: RealtimeClient,
  sessionId: string,
  onChange: () => void,
): () => void {
  return listen(client, `chat:${sessionId}`, onChange, (channel, changed) =>
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "session_messages",
        filter: `session_id=eq.${sessionId}`,
      },
      changed,
    ),
  );
}

/**
 * What both subscriptions share: coalescing, a catch-up on every SUBSCRIBED,
 * and waiting for realtime.setAuth() before the channel's first join.
 * `bind` adds the channel's postgres_changes listeners, calling `changed`.
 */
function listen(
  client: RealtimeClient,
  name: string,
  onChange: () => void,
  bind: (channel: Channel, changed: () => void) => Channel,
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

  let channel: Channel | undefined;

  // setAuth() with no token asks supabase-js for the session's. It only
  // rejects if that lookup itself throws; subscribing anyway then costs
  // nothing, and Realtime refuses it just as it would have. Logged (Group 3's
  // review of #85) so a list that never updates leaves a trace -- the error
  // name only, never the error object, which could carry the token.
  client.realtime
    .setAuth()
    .catch((error: unknown) => {
      console.warn("realtime: could not set the token", {
        error: error instanceof Error ? error.name : "unknown",
      });
    })
    .then(() => {
      if (stopped) return;
      // A topic of its own per subscription (Group 3's review of #85):
      // channel() hands back an existing channel with the same topic, and
      // removeChannel() is async, so a component remounting for the same
      // session -- or two on one page -- would get the old, closing channel
      // back and quietly stop updating.
      const topic = `${name}:${crypto.randomUUID()}`;
      channel = bind(client.channel(topic), changed).subscribe((status) => {
        if (status === "SUBSCRIBED") changed();
      });
    });

  return () => {
    stopped = true;
    clearTimeout(timer);
    if (channel) void client.removeChannel(channel);
  };
}
