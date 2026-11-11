// Reading a session's chat (US-05). Owner: C1.
//
// SERVER ONLY, like sessions.ts: the cookie-bound client applies RLS as the
// signed-in student, and session_messages_select_attendees
// (*_session_chat.sql) returns rows only to someone on the session's roster.
// A non-attendee gets an empty list, not an error -- which is also why the
// page does not call this for them: an empty chat and a hidden one would look
// the same.
//
// Client code may `import type` from here; the data reaches <SessionChat> as
// props from the session page.

import "server-only";

import type { ChatMessage } from "@/lib/chat";
import { CHAT_HISTORY_LIMIT } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";

/**
 * The session's most recent messages (at most CHAT_HISTORY_LIMIT), oldest
 * first, each with its sender's display name.
 */
export async function listMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();

  // Newest first so the limit keeps the latest, then reversed for reading.
  // `id` breaks ties between two messages in the same microsecond, so the
  // order never changes between refreshes.
  const { data, error } = await supabase
    .from("session_messages")
    .select("id, author_id, body, created_at, profiles (display_name)")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CHAT_HISTORY_LIMIT);

  if (error) {
    throw new Error(`Could not load the chat: ${error.message}`);
  }

  return data
    .map((row) => ({
      id: row.id,
      authorId: row.author_id,
      authorDisplayName: row.profiles?.display_name ?? null,
      body: row.body,
      createdAt: row.created_at,
    }))
    .reverse();
}
