"use client";

/**
 * "Students are waiting" on /sessions (US-16, R1).
 *
 * The cold-start half of the session list: a student whose course has no
 * session can say so, and a would-be host can see there is an audience before
 * giving up an evening. Two halves, both here because they are two views of
 * one idea:
 *
 *   - the open requests, most-wanted course first, each with a "Host one"
 *     link that PREFILLS the create-session form with that course
 *     (/sessions/new?department=CS&course=3251). Turning "someone wants
 *     this" into a hosted session is the point; making them retype the
 *     course would be the place it leaks.
 *   - a short form to add your own, hidden behind a button until wanted so
 *     it never competes with the session list itself.
 *
 * A Client Component for the disclosure and the two form states. The counts
 * come from listStudyRequests() via the page, already grouped by course.
 *
 * Withdrawing is per row, so each row owns its own useActionState -- one
 * shared state would show a failure under every request at once.
 */

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { requestSession, withdrawRequest } from "@/app/sessions/actions";
import CourseNumberInput from "@/components/CourseNumberInput";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD,
  FIELD_ERROR,
  FORM_ERROR,
  HINT,
  INPUT,
  LABEL,
  PANEL,
  SECTION_TITLE,
  SELECT,
} from "@/components/ui/styles";
import { STUDY_REQUEST_DAYS, STUDY_REQUEST_NOTE_MAX_LENGTH } from "@/lib/limits";
import type { Department } from "@/lib/sessions";
import type { StudyRequestGroup } from "@/lib/study-requests";

export type StudyRequestsProps = {
  requests: StudyRequestGroup[];
  /** For the form's department picker, as on the create-session form. */
  departments: Department[];
};

/** `CS 3251`, the way a student says it. */
function courseName(course: StudyRequestGroup["course"]): string {
  return `${course.departmentCode} ${course.number}`;
}

export default function StudyRequests({ requests, departments }: StudyRequestsProps) {
  const [asking, setAsking] = useState(false);
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={`${PANEL} mt-8 px-5 py-6`}>
      <h2 id={headingId} className={SECTION_TITLE}>
        Students waiting for a session
      </h2>
      <p className={`${HINT} mt-1`}>
        No session for your course? Say so here — classmates see it, and asks
        expire after {STUDY_REQUEST_DAYS} days.
      </p>

      {requests.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {requests.map((group) => (
            <li key={group.courseId}>
              <RequestRow group={group} />
            </li>
          ))}
        </ul>
      )}

      {asking ? (
        <AskForm departments={departments} onDone={() => setAsking(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className={`${BUTTON_SECONDARY} mt-4`}
        >
          Request a session
        </button>
      )}
    </section>
  );
}

function RequestRow({ group }: { group: StudyRequestGroup }) {
  const { course, count } = group;

  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[15px] font-semibold text-ink">
          {/* "1 student wants CS 3251", "3 students want CS 3251". */}
          {count === 1 ? "1 student wants" : `${count} students want`}{" "}
          {courseName(course)}
          {course.title && <span className="font-normal text-ink-2"> · {course.title}</span>}
        </p>
        <Link
          href={`/sessions/new?department=${encodeURIComponent(course.departmentCode)}&course=${encodeURIComponent(course.number)}`}
          className="min-h-11 text-sm font-semibold text-signal hover:underline"
        >
          Host one
        </Link>
      </div>

      {group.notes.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {group.notes.map((note, index) => (
            // No stable id: notes are the group's own strings, in order, and
            // the list is replaced wholesale on every revalidate.
            <li key={index} className="text-sm text-ink-2">
              “{note}”
            </li>
          ))}
        </ul>
      )}

      {group.viewerAsked && group.viewerRequestId && (
        <WithdrawButton requestId={group.viewerRequestId} course={courseName(course)} />
      )}
    </div>
  );
}

function WithdrawButton({ requestId, course }: { requestId: string; course: string }) {
  const [state, formAction, pending] = useActionState(
    withdrawRequest.bind(null, requestId),
    {},
  );

  return (
    <form action={formAction} className="mt-2">
      <p className="text-sm text-ink-2">
        You asked for this one.{" "}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 font-semibold text-signal hover:underline disabled:opacity-60"
        >
          {pending ? "Withdrawing…" : "Withdraw"}
        </button>
      </p>
      {state.error && (
        <p role="alert" className={FIELD_ERROR}>
          {`${course}: ${state.error}`}
        </p>
      )}
    </form>
  );
}

function AskForm({
  departments,
  onDone,
}: {
  departments: Department[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(requestSession, {});
  const fieldId = useId();
  const departmentId = `${fieldId}-department`;
  const courseId = `${fieldId}-course`;
  const noteId = `${fieldId}-note`;

  // Close on success: a successful ask returns `{}`, same as the starting
  // state, so "empty" alone is not enough. Track that a submit was in flight
  // and close once it finishes with no errors -- that is the only empty state
  // that means "posted". Leaving the form open would also leave the course
  // typeahead's suggestions in the DOM, which collide with the new request
  // row in the e2e journey.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.formError && !state.fieldErrors) {
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state.formError, state.fieldErrors, onDone]);

  // The department the course typeahead should look in, tracked here because
  // CourseNumberInput needs it as a prop, not off the DOM.
  const [department, setDepartment] = useState(state.values?.departmentCode ?? "");

  const errorFor = (field: "departmentCode" | "courseNumber" | "note") =>
    state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4 border-t border-line pt-4">
      {state.formError && (
        <p role="alert" className={FORM_ERROR}>
          {state.formError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor={departmentId} className={LABEL}>
            Department
          </label>
          <select
            id={departmentId}
            name="departmentCode"
            // React re-applies a select's defaultValue only on mount, and it
            // resets the form when the action finishes -- so remount it with
            // the submitted value. See FormState in src/lib/validation.ts.
            key={state.values?.departmentCode}
            defaultValue={state.values?.departmentCode ?? ""}
            onChange={(event) => setDepartment(event.target.value)}
            aria-invalid={Boolean(errorFor("departmentCode"))}
            aria-describedby={errorFor("departmentCode") ? `${departmentId}-error` : undefined}
            className={SELECT}
          >
            <option value="">Choose a department</option>
            {departments.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name ? `${option.code} — ${option.name}` : option.code}
              </option>
            ))}
          </select>
          {errorFor("departmentCode") && (
            <p id={`${departmentId}-error`} role="alert" className={FIELD_ERROR}>
              {errorFor("departmentCode")}
            </p>
          )}
        </div>

        <div className={FIELD}>
          <label htmlFor={courseId} className={LABEL}>
            Course number
          </label>
          <CourseNumberInput
            id={courseId}
            departmentCode={department}
            defaultValue={state.values?.courseNumber}
            aria-invalid={Boolean(errorFor("courseNumber"))}
            aria-describedby={errorFor("courseNumber") ? `${courseId}-error` : undefined}
          />
          {errorFor("courseNumber") && (
            <p id={`${courseId}-error`} role="alert" className={FIELD_ERROR}>
              {errorFor("courseNumber")}
            </p>
          )}
        </div>
      </div>

      <div className={FIELD}>
        <label htmlFor={noteId} className={LABEL}>
          Note <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <textarea
          id={noteId}
          name="note"
          rows={2}
          maxLength={STUDY_REQUEST_NOTE_MAX_LENGTH}
          defaultValue={state.values?.note}
          placeholder="Tue or Wed evening would suit me"
          aria-invalid={Boolean(errorFor("note"))}
          aria-describedby={errorFor("note") ? `${noteId}-error` : undefined}
          className={INPUT}
        />
        {errorFor("note") && (
          <p id={`${noteId}-error`} role="alert" className={FIELD_ERROR}>
            {errorFor("note")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Asking…" : "Post request"}
        </button>
        <button type="button" onClick={onDone} className={BUTTON_SECONDARY}>
          Cancel
        </button>
      </div>
    </form>
  );
}
