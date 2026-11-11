"use client";

/**
 * Attendee roster, seat count, and the join/leave button (US-04, US-07,
 * US-08, US-23). S6 (#52), on the session page. Each attendee's major and
 * year (US-11) sit under their name when their profile has them.
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
 * Every entry but your own has "Block" (US-22, <BlockButton>) and "Report"
 * (US-18) buttons. Block toggles to "Unblock" once blocked -- getSession()
 * sets isBlocked from the viewer's own blocks, never the reverse. Report
 * opens <ReportUserForm> under that entry; one form at a time, showing
 * nothing about the student but the name already on the roster.
 *
 * Live: while the session can still change (join, full, leave, hosting), it
 * listens for anyone else joining or leaving (src/lib/live-roster.ts) and
 * calls router.refresh() -- the same fresh props as after your own join,
 * never a hand-applied payload. Cancelled and ended sessions do not listen.
 * The "N of M going" line is a polite live region, so a screen reader hears
 * the count change too.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { joinSession, leaveSession, type SessionActionState } from "@/app/sessions/actions";
import BlockButton from "@/components/BlockButton";
import ReportUserForm from "@/components/ReportUserForm";
import { SeatsLabel } from "@/components/SessionCard";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FORM_ERROR,
  PANEL,
  SECTION_TITLE,
} from "@/components/ui/styles";
import { formatAcademicLine } from "@/lib/academic";
import { formatInitial } from "@/lib/format";
import { subscribeToRoster } from "@/lib/live-roster";
import type { RosterAction } from "@/lib/roster";
import type { Attendee } from "@/lib/sessions";
import { createClient } from "@/lib/supabase/client";

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
  // Whose report form is open (US-18), if anyone's.
  const [reporting, setReporting] = useState<string | null>(null);

  useEffect(() => {
    if (joinState.error) router.refresh();
  }, [joinState, router]);
  useEffect(() => {
    if (leaveState.error) router.refresh();
  }, [leaveState, router]);

  const live = action === "join" || action === "full" || action === "leave" || action === "hosting";
  useEffect(() => {
    if (!live) return;
    return subscribeToRoster(createClient(), sessionId, () => router.refresh());
  }, [live, sessionId, router]);

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
      {/* aria-atomic (Group 3's review of #85): React updates only the text
          node that changed, so without it a screen reader may say "2" rather
          than "2 of 4 going". */}
      <p aria-live="polite" aria-atomic="true" className="mt-0.5 text-sm text-ink-2">
        {attendees.length} of {capacity} going
      </p>

      <ul className="mt-3 divide-y divide-line">
        {attendees.map((attendee) => (
          <li key={attendee.userId} className="py-2">
            <div className="flex min-h-12 items-center gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-sm font-bold text-ink"
              >
                {formatInitial(attendee.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-ink">
                  {attendee.displayName ?? "A student"}
                  {attendee.userId === viewerId && (
                    <span className="font-normal text-ink-2"> (you)</span>
                  )}
                </span>
                {/* US-11: context from their profile, when they gave any. */}
                {formatAcademicLine(attendee.major, attendee.classYear) && (
                  <span className="block truncate text-sm text-ink-2">
                    {formatAcademicLine(attendee.major, attendee.classYear)}
                  </span>
                )}
              </span>
              {attendee.isHost && (
                <span className="shrink-0 rounded-md bg-paper px-2 py-0.5 text-xs font-semibold text-ink-2">
                  Host
                </span>
              )}
              {attendee.userId !== viewerId && (
                <>
                  <BlockButton
                    userId={attendee.userId}
                    displayName={attendee.displayName}
                    isBlocked={attendee.isBlocked ?? false}
                  />
                  <button
                    type="button"
                    aria-label={`Report ${attendee.displayName ?? "this student"}`}
                    aria-expanded={reporting === attendee.userId}
                    onClick={() =>
                      setReporting(reporting === attendee.userId ? null : attendee.userId)
                    }
                    className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-ink-2 hover:bg-paper hover:text-danger-on-light"
                  >
                    Report
                  </button>
                </>
              )}
            </div>
            {reporting === attendee.userId && (
              <ReportUserForm
                reportedUserId={attendee.userId}
                displayName={attendee.displayName}
                sessionId={sessionId}
                onClose={() => setReporting(null)}
              />
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
