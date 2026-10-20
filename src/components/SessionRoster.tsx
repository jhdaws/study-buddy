"use client";

/**
 * Attendee roster, seat count, and the join/leave button (US-04, US-07,
 * US-08, US-23). S6 (#52), on the session page.
 *
 * The page decides which button to offer (rosterAction(), src/lib/roster.ts)
 * and passes the roster in as props; this component only renders them and
 * runs S5's actions. Both actions revalidate this page on success, so the
 * fresh roster arrives as new props -- nothing here edits the list by hand,
 * so it cannot drift from the database, which is the entire point of showing
 * a seat count.
 *
 * Errors are the database's refusals, mapped to copy in src/lib/errors.ts
 * ("This session is full.", ...). A refusal means this page was out of date
 * -- most often, the last seat went while it was open -- so it refreshes the
 * roster too, and the button then matches the message.
 *
 * Not yet: a realtime subscription, so the roster also changes while you
 * watch it. It needs session_attendees added to the supabase_realtime
 * publication (a migration), and when it lands it should call
 * router.refresh() on any change rather than apply the payload itself.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { joinSession, leaveSession, type SessionActionState } from "@/app/sessions/actions";
import { SeatsLabel } from "@/components/SessionCard";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FORM_ERROR,
  PANEL,
  SECTION_TITLE,
} from "@/components/ui/styles";
import { formatInitial } from "@/lib/format";
import type { RosterAction } from "@/lib/roster";
import type { Attendee } from "@/lib/sessions";

export type SessionRosterProps = {
  sessionId: string;
  capacity: number;
  seatsLeft: number;
  /** The host first, then in the order people joined (getSession()). */
  attendees: Attendee[];
  /** The signed-in student, to mark them "(you)". */
  viewerId: string;
  action: RosterAction;
};

const NOTHING_YET: SessionActionState = {};

const NOTE = "rounded-xl bg-paper px-4 py-3 text-[15px] font-semibold text-ink";

export default function SessionRoster({
  sessionId,
  capacity,
  seatsLeft,
  attendees,
  viewerId,
  action,
}: SessionRosterProps) {
  const router = useRouter();
  const [joinState, join, joining] = useActionState(
    joinSession.bind(null, sessionId),
    NOTHING_YET,
  );
  const [leaveState, leave, leaving] = useActionState(
    leaveSession.bind(null, sessionId),
    NOTHING_YET,
  );

  useEffect(() => {
    if (joinState.error) router.refresh();
  }, [joinState, router]);
  useEffect(() => {
    if (leaveState.error) router.refresh();
  }, [leaveState, router]);

  // Only the message for the button on screen: after a refused join has
  // refreshed the page into "You're going", "already on the roster" is noise.
  const error =
    action === "leave"
      ? leaveState.error
      : action === "join" || action === "full"
        ? joinState.error
        : undefined;

  return (
    <section aria-labelledby="roster-heading" className={`${PANEL} px-4 py-5 sm:px-6`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="roster-heading" className={SECTION_TITLE}>
          Who&apos;s going
        </h2>
        <SeatsLabel seatsLeft={seatsLeft} />
      </div>
      <p className="mt-0.5 text-sm text-ink-2">
        {attendees.length} of {capacity} going
      </p>

      <ul className="mt-3 divide-y divide-line">
        {attendees.map((attendee) => (
          <li key={attendee.userId} className="flex min-h-12 items-center gap-3 py-2">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold text-ink"
            >
              {formatInitial(attendee.displayName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {attendee.displayName ?? "A student"}
              {attendee.userId === viewerId && (
                <span className="font-normal text-ink-2"> (you)</span>
              )}
            </span>
            {attendee.isHost && (
              <span className="shrink-0 rounded-md bg-paper px-2 py-0.5 text-xs font-semibold text-ink-2">
                Host
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-3">
        {action === "join" && (
          <form action={join}>
            <button type="submit" disabled={joining} className={`${BUTTON_PRIMARY} w-full`}>
              {joining ? "Joining…" : "Join session"}
            </button>
          </form>
        )}

        {action === "full" && (
          <>
            <button
              type="button"
              disabled
              aria-describedby={error ? undefined : "roster-full-reason"}
              className={`${BUTTON_PRIMARY} w-full`}
            >
              Session full
            </button>
            {!error && (
              <p id="roster-full-reason" className="text-sm text-ink-2">
                Every seat is taken. If someone leaves, their seat opens up here.
              </p>
            )}
          </>
        )}

        {action === "leave" && (
          <>
            <p className={NOTE}>You&apos;re going.</p>
            <form action={leave}>
              <button type="submit" disabled={leaving} className={`${BUTTON_SECONDARY} w-full`}>
                {leaving ? "Leaving…" : "Leave session"}
              </button>
            </form>
          </>
        )}

        {action === "hosting" && <p className={NOTE}>You&apos;re hosting this session.</p>}
        {action === "cancelled" && (
          <p role="status" className={NOTE}>
            The host cancelled this session.
          </p>
        )}
        {action === "ended" && <p className={NOTE}>This session has ended.</p>}

        {error && (
          <p role="alert" className={FORM_ERROR}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
