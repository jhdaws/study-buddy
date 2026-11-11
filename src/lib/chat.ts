// Session chat (US-05): who sees it, and whether it takes new messages.
// Pure and client-safe, so every case is unit tested (chat.test.ts) rather
// than found by clicking. Reading the messages is listMessages() in
// src/lib/messages.ts (server only).
//
// Like rosterAction(), this is a UX answer, not a permission check. The
// session_messages policies (*_session_chat.sql) are the enforcement: a
// non-attendee who asks the Data API or Realtime directly gets nothing, and a
// post to a closed chat is refused (US-05b). The page only avoids showing a
// transcript it could not load, or a form the database would refuse.

import { CHAT_OPEN_DAYS_AFTER_END } from "@/lib/limits";
import type { SessionDetail } from "@/lib/sessions";

/** One message, as the session page shows it. */
export type ChatMessage = {
  id: string;
  /** Null once the sender has deleted their account ("Deleted user"). */
  authorId: string | null;
  /** Null for a deleted account, or a profile with no name yet. */
  authorDisplayName: string | null;
  body: string;
  /** ISO instant, UTC. Shown in campus time (formatMessageTime()). */
  createdAt: string;
};

export type ChatAccess =
  /** Not on the roster: no transcript, a prompt instead. */
  | "hidden"
  /** On the roster, and the chat takes new messages. */
  | "open"
  /** On the roster; cancelled, or ended over a week ago: read-only. */
  | "closed";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The first rule that applies wins: the roster decides whether there is a
 * chat to see at all, then the session decides whether it is still open.
 */
export function chatAccess(
  session: Pick<SessionDetail, "status" | "endsAt" | "attendees">,
  viewerId: string,
  now: Date,
): ChatAccess {
  if (!session.attendees.some((attendee) => attendee.userId === viewerId)) return "hidden";
  if (session.status === "cancelled") return "closed";
  const closesAt = Date.parse(session.endsAt) + CHAT_OPEN_DAYS_AFTER_END * DAY_MS;
  return now.getTime() < closesAt ? "open" : "closed";
}
