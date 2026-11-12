"use client";

/**
 * The report form under one roster entry (US-18), opened by that entry's
 * "Report" button in <SessionRoster>. Posts to reportUser()
 * (src/app/reports/actions.ts) with `useActionState`.
 *
 * Fields (reportUserSchema): `reportedUserId` and `sessionId`, hidden;
 * `reason`, a radio group; `note`, optional. Never who is reporting: the
 * database takes that from the session.
 *
 * Shows nothing about the reported student but the display name the roster
 * already shows, and the confirmation says nothing about them either -- not
 * whether anyone else has reported them, not what happens next to them.
 *
 * The radios are uncontrolled, so React's post-action form reset would clear
 * the chosen reason after a refusal; the group is keyed on the submitted
 * reason, which remounts it with that one checked (validation.ts's FormState
 * note). Mobile first (ADR 0004): each reason's whole row is a 44px target,
 * and the note is `text-base`.
 */

import { useActionState, useEffect, useId, useRef } from "react";

import { reportUser, type ReportUserState } from "@/app/reports/actions";
import {
  BUTTON_SECONDARY,
  FIELD_ERROR,
  FORM_ERROR,
  HINT,
  LABEL,
} from "@/components/ui/styles";
import { REPORT_NOTE_MAX_LENGTH } from "@/lib/limits";
import { REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/reports";

export type ReportUserFormProps = {
  reportedUserId: string;
  /** As the roster shows it; null for a profile with no name yet. */
  displayName: string | null;
  sessionId: string;
  /** Close the form (Cancel, or Done after sending). */
  onClose: () => void;
  /** useActionState's starting state. `{}` in the roster; tests pass others. */
  initialState?: ReportUserState;
};

const BUTTON_DANGER =
  "inline-flex h-11 min-h-11 items-center justify-center rounded-xl bg-danger-on-light px-4 text-[15px] font-semibold text-white hover:bg-danger-on-light/90 disabled:cursor-not-allowed disabled:opacity-60";

export default function ReportUserForm({
  reportedUserId,
  displayName,
  sessionId,
  onClose,
  initialState = {},
}: ReportUserFormProps) {
  const [state, formAction, pending] = useActionState(reportUser, initialState);
  const prefix = useId();
  const name = displayName ?? "this student";
  const first = useRef<HTMLElement>(null);

  // Move focus into the form when it opens, and onto the confirmation once
  // sent, so a screen reader hears what changed.
  useEffect(() => {
    first.current?.focus();
  }, [state.sent]);

  if (state.sent) {
    return (
      <div className="mt-2 flex flex-col gap-3 rounded-xl bg-paper px-4 py-3">
        <p
          ref={(element) => {
            first.current = element;
          }}
          tabIndex={-1}
          role="status"
          className="text-[15px] font-semibold text-ink focus:outline-none"
        >
          Thanks. Your report was sent to the Study Buddy team, who read every one. {name} won&apos;t
          be told who reported them.
        </p>
        <button type="button" onClick={onClose} className={`${BUTTON_SECONDARY} w-full sm:w-auto sm:self-start`}>
          Done
        </button>
      </div>
    );
  }

  const values = state.values ?? {};
  const reasonError = state.fieldErrors?.reason?.[0];
  const noteError = state.fieldErrors?.note?.[0];
  const ids = {
    legend: `${prefix}-legend`,
    reasonError: `${prefix}-reason-error`,
    note: `${prefix}-note`,
    noteHint: `${prefix}-note-hint`,
    noteError: `${prefix}-note-error`,
  };

  return (
    <form
      action={formAction}
      noValidate
      aria-labelledby={ids.legend}
      className="mt-2 flex flex-col gap-4 rounded-xl border border-line bg-paper px-4 py-4"
    >
      <input type="hidden" name="reportedUserId" value={reportedUserId} />
      <input type="hidden" name="sessionId" value={sessionId} />

      <fieldset
        key={values.reason ?? ""}
        aria-describedby={reasonError ? ids.reasonError : undefined}
        className="flex flex-col gap-1"
      >
        <legend id={ids.legend} className="mb-1 text-[15px] font-bold text-ink">
          Report {name}
        </legend>
        <p className={`${HINT} mb-1`}>Only the Study Buddy team sees reports. What happened?</p>
        {REPORT_REASONS.map((reason, index) => (
          <label
            key={reason}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink"
          >
            <input
              ref={
                index === 0
                  ? (element) => {
                      first.current = element;
                    }
                  : undefined
              }
              type="radio"
              name="reason"
              value={reason}
              defaultChecked={values.reason === reason}
              required
              className="size-5 shrink-0 accent-brand"
            />
            {REPORT_REASON_LABELS[reason]}
          </label>
        ))}
        {reasonError && (
          <p id={ids.reasonError} role="alert" className={FIELD_ERROR}>
            {reasonError}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.note} className={LABEL}>
          Anything else? <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea
          id={ids.note}
          name="note"
          rows={3}
          maxLength={REPORT_NOTE_MAX_LENGTH}
          defaultValue={values.note ?? ""}
          aria-invalid={noteError ? true : undefined}
          aria-describedby={[ids.noteHint, noteError && ids.noteError].filter(Boolean).join(" ")}
          className="block min-h-11 w-full rounded-xl border border-field bg-white px-3.5 py-2.5 text-base text-ink focus:border-signal focus:ring-4 focus:ring-signal/15 focus:outline-none"
        />
        <p id={ids.noteHint} className={HINT}>
          Up to {REPORT_NOTE_MAX_LENGTH} characters.
        </p>
        {noteError && (
          <p id={ids.noteError} role="alert" className={FIELD_ERROR}>
            {noteError}
          </p>
        )}
      </div>

      {state.formError && (
        <p role="alert" className={FORM_ERROR}>
          {state.formError}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className={BUTTON_DANGER}>
          {pending ? "Sending…" : "Send report"}
        </button>
        <button type="button" onClick={onClose} className={BUTTON_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}
