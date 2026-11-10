"use client";

/**
 * Edit and Cancel, for the host of a session (US-09). S7, on the session page.
 *
 * The page decides whether to render this at all -- it only does so for the
 * host, of a session that is open and has not ended. That is presentation,
 * not authorisation: cancel_session() and update_session() compare auth.uid()
 * against the stored host_id themselves, and there is no UPDATE policy on
 * `sessions` for either to be bypassed (see the migration).
 *
 * Cancel asks first. The confirm step is a second button rather than
 * window.confirm() so the warning can say what cancelling actually does --
 * everyone on the roster loses the session, and it cannot be undone -- and so
 * it is reachable and testable like any other markup.
 *
 * On success cancelSession() revalidates this page, so the cancelled state
 * arrives as new props and this component does not track it. A refusal is a
 * mapped message from src/lib/errors.ts ("Only the host can change or cancel
 * this session.", "This session has already ended.") and means the page was
 * out of date, so it refreshes too -- the same pattern as <SessionRoster>.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { cancelSession, type SessionActionState } from "@/app/sessions/actions";
import { BUTTON_SECONDARY, FORM_ERROR, PANEL, SECTION_TITLE } from "@/components/ui/styles";

const NOTHING_YET: SessionActionState = {};

const DANGER_BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-danger-on-light/40 " +
  "bg-white px-4 text-[15px] font-semibold text-danger-on-light hover:bg-danger-on-light/5 " +
  "disabled:cursor-wait disabled:opacity-70";

export type HostSessionControlsProps = {
  sessionId: string;
  /** People on the roster besides the host, for the confirm warning. */
  otherAttendees: number;
};

export default function HostSessionControls({
  sessionId,
  otherAttendees,
}: HostSessionControlsProps) {
  const [state, formAction, pending] = useActionState(
    cancelSession.bind(null, sessionId),
    NOTHING_YET,
  );
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  // A refusal means this page is stale -- refresh so the page and the message
  // agree (a session someone else already ended, say).
  useEffect(() => {
    if (state.error) router.refresh();
  }, [state.error, router]);

  return (
    <section aria-labelledby="host-controls-heading" className={`${PANEL} px-4 py-5 sm:px-6`}>
      {/* <SessionRoster> already says "You're hosting this session." above; this
          heading names the controls rather than repeating that. */}
      <h2 id="host-controls-heading" className={SECTION_TITLE}>
        Manage your session
      </h2>

      {!confirming ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Link href={`/sessions/${sessionId}/edit`} className={`${BUTTON_SECONDARY} px-4`}>
            Edit session
          </Link>
          <button type="button" onClick={() => setConfirming(true)} className={DANGER_BUTTON}>
            Cancel session
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[15px] text-ink-2">
            {otherAttendees === 0
              ? "Cancel this session? It will leave the session list, and you can't undo it."
              : `Cancel this session? ${
                  otherAttendees === 1 ? "1 other student is" : `${otherAttendees} other students are`
                } coming. It will leave the session list, and you can't undo it.`}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <form action={formAction}>
              <button type="submit" disabled={pending} className={`${DANGER_BUTTON} w-full sm:w-auto`}>
                {pending ? "Cancelling…" : "Yes, cancel it"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className={`${BUTTON_SECONDARY} px-4`}
            >
              Keep the session
            </button>
          </div>
        </div>
      )}

      {state.error && (
        <p role="alert" className={`${FORM_ERROR} mt-3`}>
          {state.error}
        </p>
      )}
    </section>
  );
}
