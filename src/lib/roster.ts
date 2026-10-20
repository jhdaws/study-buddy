// What the session page offers the student looking at it (S6, #52): Join,
// Leave, or a reason there is no button. Pure, so every case is unit tested
// (roster.test.ts) rather than found by clicking.
//
// This is a UX answer, not a permission check. join_session/leave_session
// (S5) refuse every one of these cases themselves, under the row lock that
// makes "is there a seat?" true at the moment of joining (US-07b); the page
// only avoids offering a button the database would refuse.

import type { SessionDetail } from "@/lib/sessions";

export type RosterAction =
  /** The host cancelled it (US-09, later): no button, a notice. */
  | "cancelled"
  /** It is over. */
  | "ended"
  /** The viewer hosts it: "You're hosting" instead of a button. */
  | "hosting"
  /** The viewer is on the roster. */
  | "leave"
  /** No seat left: Join, disabled, with the reason (US-07). */
  | "full"
  | "join";

/**
 * The first rule that applies wins: a cancelled or ended session offers
 * nothing to anyone, its host included.
 */
export function rosterAction(
  session: Pick<SessionDetail, "status" | "endsAt" | "hostId" | "attendees" | "seatsLeft">,
  viewerId: string,
  now: Date,
): RosterAction {
  if (session.status === "cancelled") return "cancelled";
  if (Date.parse(session.endsAt) <= now.getTime()) return "ended";
  if (session.hostId === viewerId) return "hosting";
  if (session.attendees.some((attendee) => attendee.userId === viewerId)) return "leave";
  if (session.seatsLeft <= 0) return "full";
  return "join";
}
