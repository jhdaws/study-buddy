"use client";

/**
 * The session page's two interactive parts (US-04, US-07, US-08, US-23), from
 * the 2026-10-20 redesign:
 *
 *   <SessionActions>  the row directly under the details and map: Join
 *                     session (blue), Leave session (red text), a disabled
 *                     "You're hosting" or "Session is full", and Add to
 *                     calendar (Google Calendar, or an .ics for Apple and
 *                     Outlook). A toast confirms a join: "You're in. See you
 *                     at Featheringill Hall."
 *   <WhosGoing>       the side card: seats taken, faces with empty seats
 *                     drawn in, and the roster by display name, host marked.
 *
 * The page decides which action applies (rosterAction(), src/lib/roster.ts).
 * S5's actions revalidate the page on success, so the fresh roster arrives
 * as new props; nothing here edits the list by hand. A refusal ("This
 * session is full.") means the page was stale, so it refreshes too.
 */

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { joinSession, leaveSession, type SessionActionState } from "@/app/sessions/actions";
import Icon from "@/components/ui/Icon";
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, FORM_ERROR } from "@/components/ui/styles";
import { googleCalendarUrl } from "@/lib/ics";
import type { RosterAction } from "@/lib/roster";
import { avatarColour, initialsOf } from "@/lib/session-view";
import type { Attendee, SessionListItem } from "@/lib/sessions";

const NOTHING_YET: SessionActionState = {};

export type SessionActionsProps = {
  sessionId: string;
  action: RosterAction;
  /** For the toast and the calendar link. */
  session: Pick<SessionListItem, "course" | "topic" | "startsAt" | "endsAt" | "locationLabel" | "room">;
  /** Whether "Add to calendar" applies (upcoming sessions only). */
  canAddToCalendar: boolean;
};

export default function SessionActions({ sessionId, action, session, canAddToCalendar }: SessionActionsProps) {
  const router = useRouter();
  const [joinState, join, joining] = useActionState(joinSession.bind(null, sessionId), NOTHING_YET);
  const [leaveState, leave, leaving] = useActionState(leaveSession.bind(null, sessionId), NOTHING_YET);
  const [toast, setToast] = useState<string | null>(null);

  // A refusal means this page was stale: refresh the roster.
  useEffect(() => {
    if (joinState.error || leaveState.error) router.refresh();
  }, [joinState, leaveState, router]);

  // A success gets a toast. Adjusting state while rendering, keyed on the
  // action's new state, rather than setting it from an effect.
  const [seen, setSeen] = useState({ joinState, leaveState });
  if (seen.joinState !== joinState || seen.leaveState !== leaveState) {
    setSeen({ joinState, leaveState });
    if (seen.joinState !== joinState && joinState !== NOTHING_YET && !joinState.error) {
      setToast(`You're in. See you at ${session.locationLabel}.`);
    } else if (seen.leaveState !== leaveState && leaveState !== NOTHING_YET && !leaveState.error) {
      setToast("You left the session.");
    }
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Only the message for the button on screen.
  const error =
    action === "leave" ? leaveState.error : action === "join" || action === "full" ? joinState.error : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {action === "join" && (
          <form action={join}>
            <button type="submit" disabled={joining} className={BUTTON_PRIMARY}>
              {joining ? "Joining…" : "Join session"}
            </button>
          </form>
        )}
        {action === "leave" && (
          <form action={leave}>
            <button type="submit" disabled={leaving} className={BUTTON_DANGER}>
              {leaving ? "Leaving…" : "Leave session"}
            </button>
          </form>
        )}
        {action === "full" && (
          <button
            type="button"
            disabled
            aria-describedby={error ? undefined : "roster-full-reason"}
            className={`${BUTTON_SECONDARY} !opacity-100 bg-column text-ink-2`}
          >
            Session is full
          </button>
        )}
        {action === "hosting" && (
          <span className="inline-flex h-11 items-center px-1 text-sm font-medium text-ink-2 lg:h-9">
            You&apos;re hosting
          </span>
        )}
        {action === "cancelled" && (
          <p role="status" className="text-sm font-medium text-ink-2">
            The host cancelled this session.
          </p>
        )}
        {action === "ended" && <p className="text-sm font-medium text-ink-2">This session has ended.</p>}

        {canAddToCalendar && <CalendarMenu sessionId={sessionId} session={session} />}
      </div>

      {action === "full" && !error && (
        <p id="roster-full-reason" className="text-[13px] text-ink-2">
          Every seat is taken. If someone leaves, their seat opens up here.
        </p>
      )}
      {error && (
        <p role="alert" className={FORM_ERROR}>
          {error}
        </p>
      )}

      {toast && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[60] flex h-12 max-w-[calc(100%-32px)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-line bg-white px-4 text-sm text-ink shadow-[0_12px_32px_rgba(17,24,39,0.12)] lg:bottom-6"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-seat text-white">
            <Icon name="check" size={12} />
          </span>
          <span className="truncate">{toast}</span>
        </div>
      )}
    </div>
  );
}

function CalendarMenu({ sessionId, session }: { sessionId: string; session: SessionActionsProps["session"] }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const ics = `/sessions/${sessionId}/calendar.ics`;
  const google = googleCalendarUrl(session, typeof window === "undefined" ? undefined : window.location.href);
  const item = "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-column";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={BUTTON_SECONDARY}
      >
        <Icon name="calendar" />
        Add to calendar
        <Icon name="chevDown" size={14} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute top-[calc(100%+6px)] left-0 z-30 w-[240px] rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(17,24,39,0.10)]"
        >
          <a role="menuitem" href={google} target="_blank" rel="noreferrer" className={item} onClick={() => setOpen(false)}>
            <span className="pt-0.5 text-ink-2">
              <Icon name="external" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm text-ink">Google Calendar</span>
              <span className="text-xs text-ink-2">Opens in a new tab</span>
            </span>
          </a>
          <a role="menuitem" href={ics} download className={item} onClick={() => setOpen(false)}>
            <span className="pt-0.5 text-ink-2">
              <Icon name="download" />
            </span>
            <span className="flex flex-col">
              <span className="text-sm text-ink">Apple Calendar or Outlook</span>
              <span className="text-xs text-ink-2">Downloads an .ics file</span>
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

/** Seats taken, faces with the empty seats drawn in, and the roster. */
export function WhosGoing({
  capacity,
  attendees,
  viewerId,
  title = "Who's going",
}: {
  capacity: number;
  attendees: Attendee[];
  viewerId: string;
  title?: string;
}) {
  const empty = Math.max(0, Math.min(capacity, 12) - attendees.length);
  return (
    <section aria-labelledby="roster-heading" className="rounded-xl border border-[rgba(17,24,39,0.06)] bg-white/80 p-4 backdrop-blur-[16px]">
      <h2 id="roster-heading" className="text-[15px] font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[26px] leading-none font-bold text-ink">{attendees.length}</span>
        <span className="text-[13px] text-ink-2">of {capacity} seats taken</span>
      </p>

      <div aria-hidden className="mt-3 flex flex-wrap gap-1.5">
        {attendees.map((a) => {
          const colour = avatarColour(a.userId);
          const you = a.userId === viewerId;
          return (
            <span
              key={a.userId}
              className="relative flex size-8 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                background: colour.bg,
                color: colour.fg,
                boxShadow: you ? "0 0 0 2px #2F5BEA" : undefined,
              }}
            >
              {you ? "You" : initialsOf(a.displayName)}
              {a.isHost && <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white bg-dark" />}
            </span>
          );
        })}
        {Array.from({ length: empty }, (_, i) => (
          <span key={`empty-${i}`} className="size-8 rounded-full border border-dashed border-line-strong" />
        ))}
      </div>

      <ul className="mt-3 divide-y divide-line border-t border-line">
        {attendees.map((attendee) => (
          <li key={attendee.userId} className="flex min-h-11 items-center gap-2.5 py-1.5">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{ background: avatarColour(attendee.userId).bg, color: avatarColour(attendee.userId).fg }}
            >
              {initialsOf(attendee.displayName)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {attendee.displayName ?? "A student"}
              {attendee.userId === viewerId && <span className="text-ink-2"> (you)</span>}
            </span>
            {attendee.isHost && (
              <span className="shrink-0 rounded-lg bg-[#F0EBFE] px-2 py-0.5 text-xs font-medium text-[#6D4AE8]">Host</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
