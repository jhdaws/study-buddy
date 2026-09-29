"use client";

/**
 * The create-session form (US-02). Built by W5 (#12) against the W4
 * contracts in docs/contracts.md.
 *
 * `useActionState(createSession, ...)` with createSession from
 * src/app/sessions/actions.ts (a stub until S3 #20). On success it redirects
 * to /sessions; otherwise it returns a CreateSessionState, rendered here as
 * an error beside each field (`role="alert"`, linked by `aria-describedby`,
 * with `aria-invalid` on the input) plus a form-level message by the button.
 *
 * Field names are createSessionSchema's keys (src/lib/validation.ts), exactly:
 *   departmentCode  a <select> of listDepartments(), plus "Add a department",
 *                   which swaps in a text input submitting under the same
 *                   name (the select then has no name). S2 normalises it.
 *   courseNumber    <CourseNumberInput>, a typeahead; suggestions only.
 *   topic, room     text; room optional.
 *   placeId         <LocationPicker> submits it itself.
 *   locationLabel   text, prefilled from the picker's onSelect label unless
 *                   the host has typed their own (ADR 0008 rule 14).
 *   startsAt/endsAt HIDDEN inputs carrying ISO 8601 with an offset. The
 *                   visible datetime-local inputs have no name: their values
 *                   have no time zone and the schema rejects them on
 *                   purpose, so they are converted in the browser
 *                   (src/lib/datetime-local.ts). They are read as
 *                   NASHVILLE time, not the device's -- the same zone the
 *                   list shows -- and each says so in a hint. This form
 *                   therefore needs JavaScript to submit valid times.
 *   capacity        number, at least MIN_CAPACITY, the host included.
 *
 * KEEPING WHAT THE STUDENT TYPED. React resets the form after every action,
 * including one that returns errors. Uncontrolled inputs (topic, room,
 * capacity) take `state.values` as `defaultValue`, which the reset then
 * restores. Fields with logic attached (new department, course, label, times)
 * are controlled, and a controlled text or hidden input survives the reset.
 * The department <select> is controlled too -- the typeahead and the "add"
 * input depend on it -- and a controlled select does NOT survive: the reset
 * puts it back on its `defaultSelected` option. So it mirrors its value into
 * `defaultSelected`, as <LocationPicker> does, which makes the reset a no-op.
 * (docs/contracts.md suggests `key` + `defaultValue`, which suits an
 * uncontrolled select and does work. This one is controlled because the
 * typeahead and the "add" input read its value on every change; one source
 * of truth -- React state -- beats a state variable and a remounted DOM
 * select that must agree after every submit.) CreateSessionForm.test.tsx
 * submits twice and checks nothing is lost, and fails without the mirror.
 *
 * `noValidate`: the browser's own validation bubbles are skipped so every
 * message comes from createSessionSchema, worded once. `required`, `min` and
 * `maxLength` stay on the inputs for assistive technology and to stop
 * over-long typing.
 *
 * Mobile first (ADR 0004): one column, 44px controls (`min-h-11`), and
 * `text-base` on every input so iOS Safari does not zoom on focus.
 */

import { useActionState, useEffect, useId, useRef, useState } from "react";

import { createSession, type CreateSessionState } from "@/app/sessions/actions";
import CourseNumberInput from "@/components/CourseNumberInput";
import LocationPicker, { type PickedPlace } from "@/components/LocationPicker";
import { isoToLocalInput, localInputToIso } from "@/lib/datetime-local";
import {
  LOCATION_LABEL_MAX_LENGTH,
  MIN_CAPACITY,
  ROOM_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from "@/lib/limits";
import type { Department } from "@/lib/sessions";
// Types only: importing a value from validation.ts would ship zod to the
// browser (see src/lib/limits.ts).
import type { CreateSessionField } from "@/lib/validation";

/** The department <select>'s value for "Add a department". Never submitted. */
export const ADD_DEPARTMENT = "__add__";

const INPUT =
  "block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:aria-[invalid=true]:border-red-400";
const LABEL = "block text-base font-medium";
const HINT = "mt-0.5 text-sm text-neutral-600 dark:text-neutral-400";
const FIELD = "flex flex-col gap-1.5";
const LEGEND = "text-lg font-semibold";
const GROUP = "mt-3 flex flex-col gap-5";

export type CreateSessionFormProps = {
  /** From listDepartments(), ordered by code. */
  departments: Department[];
  /**
   * useActionState's starting state. `{}` on the page; tests pass one with
   * errors and values to check how it renders.
   */
  initialState?: CreateSessionState;
};

export default function CreateSessionForm({
  departments,
  initialState = {},
}: CreateSessionFormProps) {
  const [state, formAction, pending] = useActionState(createSession, initialState);
  const values = state.values ?? {};
  const prefix = useId();

  // --- Department: a known code, or "add" plus free text -------------------
  const initialDepartment = initialState.values?.departmentCode ?? "";
  const initiallyKnown =
    initialDepartment === "" || departments.some((d) => d.code === initialDepartment);
  const [departmentChoice, setDepartmentChoice] = useState(
    initiallyKnown ? initialDepartment : ADD_DEPARTMENT,
  );
  const [newDepartment, setNewDepartment] = useState(
    initiallyKnown ? "" : initialDepartment,
  );
  const adding = departmentChoice === ADD_DEPARTMENT;
  const departmentCode = adding ? newDepartment : departmentChoice;

  // Survive React's post-action form reset: see the top of this file.
  const departmentSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    for (const option of departmentSelect.current?.options ?? []) {
      option.defaultSelected = option.value === departmentChoice;
    }
  }, [departmentChoice, departments]);

  // --- Location label: prefilled from the picker until the host edits it ----
  const [locationLabel, setLocationLabel] = useState(
    () => initialState.values?.locationLabel ?? "",
  );
  const [labelEdited, setLabelEdited] = useState(
    () => Boolean(initialState.values?.locationLabel),
  );
  const initialPlace: PickedPlace | undefined = initialState.values?.placeId
    ? {
        placeId: initialState.values.placeId,
        label: initialState.values.locationLabel ?? "",
      }
    : undefined;

  function onPlaceSelect(place: PickedPlace | null) {
    if (labelEdited) return;
    setLocationLabel(place?.label ?? "");
  }

  // --- Times: visible local inputs, hidden ISO inputs ----------------------
  const [startsAtLocal, setStartsAtLocal] = useState(() =>
    isoToLocalInput(initialState.values?.startsAt),
  );
  const [endsAtLocal, setEndsAtLocal] = useState(() =>
    isoToLocalInput(initialState.values?.endsAt),
  );

  // --- Errors ---------------------------------------------------------------
  const ids = (field: CreateSessionField) => ({
    input: `${prefix}-${field}`,
    hint: `${prefix}-${field}-hint`,
    error: `${prefix}-${field}-error`,
  });
  const errorFor = (field: CreateSessionField) => state.fieldErrors?.[field]?.[0];
  /** aria-invalid and aria-describedby for a field's input. */
  const a11y = (field: CreateSessionField, hasHint = false) => {
    const error = errorFor(field);
    const describedBy = [hasHint && ids(field).hint, error && ids(field).error]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };
  const errorCount = Object.values(state.fieldErrors ?? {}).filter(
    (messages) => messages && messages.length > 0,
  ).length;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-6">
      {/* ------------------------------------------------------------ Course */}
      <fieldset className="min-w-0">
        <legend className={LEGEND}>Course</legend>
        <div className={GROUP}>
          <div className={FIELD}>
            <label htmlFor={`${prefix}-department`} className={LABEL}>
              Department
            </label>
            <select
              ref={departmentSelect}
              id={`${prefix}-department`}
              // While adding, the text input below submits departmentCode.
              name={adding ? undefined : "departmentCode"}
              value={departmentChoice}
              onChange={(event) => setDepartmentChoice(event.target.value)}
              required
              {...(adding ? {} : a11y("departmentCode"))}
              className={INPUT}
            >
              <option value="">Choose a department</option>
              {departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {department.name
                    ? `${department.code} — ${department.name}`
                    : department.code}
                </option>
              ))}
              <option value={ADD_DEPARTMENT}>Add a department…</option>
            </select>
            {!adding && <FieldError id={ids("departmentCode").error} message={errorFor("departmentCode")} />}
          </div>

          {adding && (
            <div className={FIELD}>
              <label htmlFor={ids("departmentCode").input} className={LABEL}>
                New department code
              </label>
              <p id={ids("departmentCode").hint} className={HINT}>
                The letters before the course number, like BME.
              </p>
              <input
                id={ids("departmentCode").input}
                name="departmentCode"
                type="text"
                value={newDepartment}
                onChange={(event) => setNewDepartment(event.target.value)}
                required
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                {...a11y("departmentCode", true)}
                className={INPUT}
              />
              <FieldError id={ids("departmentCode").error} message={errorFor("departmentCode")} />
            </div>
          )}

          <div className={FIELD}>
            <label htmlFor={ids("courseNumber").input} className={LABEL}>
              Course number
            </label>
            <p id={ids("courseNumber").hint} className={HINT}>
              Like 3251, or 1601L for a lab.
            </p>
            <CourseNumberInput
              id={ids("courseNumber").input}
              departmentCode={departmentCode}
              defaultValue={initialState.values?.courseNumber}
              {...a11y("courseNumber", true)}
              className={INPUT}
            />
            <FieldError id={ids("courseNumber").error} message={errorFor("courseNumber")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("topic").input} className={LABEL}>
              What are you studying?
            </label>
            <input
              id={ids("topic").input}
              name="topic"
              type="text"
              defaultValue={values.topic}
              required
              maxLength={TOPIC_MAX_LENGTH}
              placeholder="e.g. Exam 2 practice problems"
              {...a11y("topic")}
              className={INPUT}
            />
            <FieldError id={ids("topic").error} message={errorFor("topic")} />
          </div>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------- Where */}
      <fieldset className="min-w-0">
        <legend className={LEGEND}>Where</legend>
        <div className={GROUP}>
          <div className={FIELD}>
            <label htmlFor={ids("placeId").input} className={LABEL}>
              Place
            </label>
            <LocationPicker
              id={ids("placeId").input}
              defaultValue={initialPlace}
              onSelect={onPlaceSelect}
              required
              {...a11y("placeId")}
            />
            <FieldError id={ids("placeId").error} message={errorFor("placeId")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("locationLabel").input} className={LABEL}>
              Location name
            </label>
            <p id={ids("locationLabel").hint} className={HINT}>
              Shown on the session. Filled in from the place &mdash; change it to
              what students call it.
            </p>
            <input
              id={ids("locationLabel").input}
              name="locationLabel"
              type="text"
              value={locationLabel}
              onChange={(event) => {
                setLocationLabel(event.target.value);
                // Emptying the field hands it back to the picker.
                setLabelEdited(event.target.value !== "");
              }}
              required
              maxLength={LOCATION_LABEL_MAX_LENGTH}
              {...a11y("locationLabel", true)}
              className={INPUT}
            />
            <FieldError id={ids("locationLabel").error} message={errorFor("locationLabel")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("room").input} className={LABEL}>
              Room <span className="font-normal text-neutral-600 dark:text-neutral-400">(optional)</span>
            </label>
            <input
              id={ids("room").input}
              name="room"
              type="text"
              defaultValue={values.room}
              maxLength={ROOM_MAX_LENGTH}
              placeholder="e.g. Room 100"
              {...a11y("room")}
              className={INPUT}
            />
            <FieldError id={ids("room").error} message={errorFor("room")} />
          </div>
        </div>
      </fieldset>

      {/* -------------------------------------------------------------- When */}
      <fieldset className="min-w-0">
        <legend className={LEGEND}>When</legend>
        <div className={GROUP}>
          <div className={FIELD}>
            <label htmlFor={ids("startsAt").input} className={LABEL}>
              Starts
            </label>
            <p id={ids("startsAt").hint} className={HINT}>
              Nashville time (Central)
            </p>
            <input
              id={ids("startsAt").input}
              type="datetime-local"
              value={startsAtLocal}
              onChange={(event) => setStartsAtLocal(event.target.value)}
              required
              {...a11y("startsAt", true)}
              className={INPUT}
            />
            <input type="hidden" name="startsAt" value={localInputToIso(startsAtLocal)} />
            <FieldError id={ids("startsAt").error} message={errorFor("startsAt")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("endsAt").input} className={LABEL}>
              Ends
            </label>
            <p id={ids("endsAt").hint} className={HINT}>
              Nashville time (Central)
            </p>
            <input
              id={ids("endsAt").input}
              type="datetime-local"
              value={endsAtLocal}
              onChange={(event) => setEndsAtLocal(event.target.value)}
              required
              {...a11y("endsAt", true)}
              className={INPUT}
            />
            <input type="hidden" name="endsAt" value={localInputToIso(endsAtLocal)} />
            <FieldError id={ids("endsAt").error} message={errorFor("endsAt")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("capacity").input} className={LABEL}>
              How many people, including you?
            </label>
            <p id={ids("capacity").hint} className={HINT}>
              At least {MIN_CAPACITY} &mdash; you count as one.
            </p>
            <input
              id={ids("capacity").input}
              name="capacity"
              type="number"
              inputMode="numeric"
              defaultValue={values.capacity}
              required
              min={MIN_CAPACITY}
              step={1}
              {...a11y("capacity", true)}
              className={INPUT}
            />
            <FieldError id={ids("capacity").error} message={errorFor("capacity")} />
          </div>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------ Submit */}
      <div className="flex flex-col gap-3">
        {state.formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-base text-red-800 dark:bg-red-950 dark:text-red-200">
            {state.formError}
          </p>
        )}
        {errorCount > 0 && (
          <p role="alert" className="text-base text-red-700 dark:text-red-400">
            {errorCount === 1
              ? "Check the field marked above."
              : `Check the ${errorCount} fields marked above.`}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {pending ? "Creating session…" : "Create session"}
        </button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-red-700 dark:text-red-400">
      {message}
    </p>
  );
}
