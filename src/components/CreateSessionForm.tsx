"use client";

/**
 * The create-session form (US-02). Built by W5 (#12) against the W4
 * contracts in docs/contracts.md; laid out to the 2026-10-20 redesign: one
 * white card in three steps (Course, Where, When and seats), each ticked when
 * done, with a live preview, what is still needed, and Create session kept in
 * view on the right.
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
 *   startsAt/endsAt HIDDEN inputs carrying ISO 8601 instants. The host picks
 *                   a day (today and the next six, or "Later" for any
 *                   date), a start time and a length (1 to 3 hours); none
 *                   of those has a name. src/lib/when-picker.ts turns the
 *                   picks into the two instants, read as NASHVILLE time,
 *                   not the device's. This form therefore needs JavaScript
 *                   to submit valid times.
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
 * BOTH SELECTS UPDATE ON `input`, NOT ONLY `change` (BUG-15). When a person
 * picks an option, the browser fires `input`, then `change`, as separate
 * events. The form's own onInput refreshes the preview, which re-renders --
 * and a re-render puts a controlled <select> back on its `value` prop. If
 * the select's state only changed on `change`, that re-render lands between
 * the two events with the OLD value, so the pick is undone before React
 * hears about it: the department could never be chosen. Handling `input`
 * too updates the state in the same render. Playwright's selectOption()
 * fires both events from one script call, which hides this; the journeys
 * choose by keyboard instead (tests/e2e/helpers.ts, chooseByKeyboard).
 *
 * `noValidate`: the browser's own validation bubbles are skipped so every
 * message comes from createSessionSchema, worded once. `required`, `min` and
 * `maxLength` stay on the inputs for assistive technology and to stop
 * over-long typing.
 *
 * Mobile first (ADR 0004): one column, 44px controls (`min-h-11`), and
 * `text-base` on every input so iOS Safari does not zoom on focus.
 */

import { type FormEvent, useActionState, useEffect, useId, useRef, useState } from "react";

import { createSession, type CreateSessionState } from "@/app/sessions/actions";
import CourseNumberInput from "@/components/CourseNumberInput";
import LocationPicker, { type PickedPlace } from "@/components/LocationPicker";
import SessionCard from "@/components/SessionCard";
import Icon from "@/components/ui/Icon";
import { BUTTON_PRIMARY, FIELD, FIELD_ERROR, HINT, INPUT, LABEL, SELECT } from "@/components/ui/styles";
import {
  LOCATION_LABEL_MAX_LENGTH,
  MIN_CAPACITY,
  ROOM_MAX_LENGTH,
  TOPIC_MAX_LENGTH,
} from "@/lib/limits";
import type { Department, SessionListItem } from "@/lib/sessions";
import {
  DEFAULT_LENGTH,
  endsHint,
  formatLength,
  isoToWhen,
  LENGTHS,
  nextDays,
  suggestedStart,
  whenToIso,
} from "@/lib/when-picker";
// Types only: importing a value from validation.ts would ship zod to the
// browser (see src/lib/limits.ts).
import type { CreateSessionField } from "@/lib/validation";

/** The department <select>'s value for "Add a department". Never submitted. */
export const ADD_DEPARTMENT = "__add__";

/** One-tap topics under the topic field. They fill it; the host can edit. */
export const TOPIC_SUGGESTIONS = ["Midterm review", "Problem set", "Exam prep", "Project work", "Quiz prep"];

/** Default seats, the host included, for a new session. */
const DEFAULT_CAPACITY = 4;

const STEP = "flex min-w-0 flex-col gap-4 border-t border-line px-4 py-5 first:border-t-0 sm:px-5";
const CHIP =
  "inline-flex h-11 min-h-11 items-center rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-ink hover:border-line-strong lg:h-7 lg:min-h-7";
const PAGE_ALERT = "rounded-lg border border-error/30 bg-[#FDECEA] px-3 py-2.5 text-[13px] font-medium text-error";
const STEP_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-column lg:size-8";

export type CreateSessionFormProps = {
  /** From listDepartments(), ordered by code. */
  departments: Department[];
  /**
   * useActionState's starting state. `{}` on the page; tests pass one with
   * errors and values to check how it renders.
   */
  initialState?: CreateSessionState;
  /** "Now", for the day choices and the preview. Tests pass a fixed one. */
  now?: Date;
  /** The host's display name, for the preview's avatar. */
  hostName?: string;
};

type Draft = {
  departmentCode: string;
  courseNumber: string;
  topic: string;
  placeId: string;
  locationLabel: string;
  room: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
};

const EMPTY_DRAFT: Draft = {
  departmentCode: "",
  courseNumber: "",
  topic: "",
  placeId: "",
  locationLabel: "",
  room: "",
  startsAt: "",
  endsAt: "",
  capacity: "",
};

export default function CreateSessionForm({
  departments,
  initialState = {},
  now: nowProp,
  hostName = "You",
}: CreateSessionFormProps) {
  const [state, formAction, pending] = useActionState(createSession, initialState);
  const values = state.values ?? {};
  const prefix = useId();
  const [now] = useState(() => nowProp ?? new Date());

  // --- Department: a known code, or "add" plus free text -------------------
  const initialDepartment = initialState.values?.departmentCode ?? "";
  const initiallyKnown =
    initialDepartment === "" || departments.some((d) => d.code === initialDepartment);
  const [departmentChoice, setDepartmentChoice] = useState(
    initiallyKnown ? initialDepartment : ADD_DEPARTMENT,
  );
  const [newDepartment, setNewDepartment] = useState(initiallyKnown ? "" : initialDepartment);
  const adding = departmentChoice === ADD_DEPARTMENT;
  const departmentCode = adding ? newDepartment : departmentChoice;
  // On `input` as well as `change`: see BUG-15 at the top of this file.
  const chooseDepartment = (event: FormEvent<HTMLSelectElement>) =>
    setDepartmentChoice(event.currentTarget.value);

  // Survive React's post-action form reset: see the top of this file.
  const departmentSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    for (const option of departmentSelect.current?.options ?? []) {
      option.defaultSelected = option.value === departmentChoice;
    }
  }, [departmentChoice, departments]);

  // --- Topic: free text, or one tap on a suggestion -------------------------
  const topicInput = useRef<HTMLInputElement>(null);
  const applyTopic = (topic: string) => {
    if (!topicInput.current) return;
    topicInput.current.value = topic;
    refreshDraft();
    topicInput.current.focus();
  };

  // --- Location label: prefilled from the picker until the host edits it ----
  const [locationLabel, setLocationLabel] = useState(() => initialState.values?.locationLabel ?? "");
  const [labelEdited, setLabelEdited] = useState(() => Boolean(initialState.values?.locationLabel));
  const initialPlace: PickedPlace | undefined = initialState.values?.placeId
    ? { placeId: initialState.values.placeId, label: initialState.values.locationLabel ?? "" }
    : undefined;

  function onPlaceSelect(place: PickedPlace | null) {
    if (labelEdited) return;
    setLocationLabel(place?.label ?? "");
  }

  // --- When: a day, a start time and a length -> two hidden instants ---------
  const days = nextDays(now);
  const initialWhen = isoToWhen(initialState.values?.startsAt, initialState.values?.endsAt);
  const [date, setDate] = useState(initialWhen.date || days[0].date);
  const [time, setTime] = useState(initialWhen.time || suggestedStart(now));
  const [minutes, setMinutes] = useState(initialWhen.minutes || DEFAULT_LENGTH);
  const [later, setLater] = useState(() => Boolean(initialWhen.date) && !days.some((d) => d.date === initialWhen.date));
  const { startsAt, endsAt } = whenToIso(date, time, minutes);

  // --- Live preview and step state ------------------------------------------
  // Read from the form itself, so it covers controlled and uncontrolled
  // fields alike and adds nothing to what is submitted. Refreshed on every
  // input event, and after each render for changes made in code (a typeahead
  // pick, a prefilled label); the comparison stops that from looping.
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const refreshDraft = () => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    const read = (key: keyof Draft) => String(data.get(key) ?? "");
    const next = Object.fromEntries((Object.keys(EMPTY_DRAFT) as (keyof Draft)[]).map((k) => [k, read(k)])) as Draft;
    setDraft((current) =>
      (Object.keys(next) as (keyof Draft)[]).every((k) => current[k] === next[k]) ? current : next,
    );
  };
  useEffect(refreshDraft);

  // --- Capacity stepper ------------------------------------------------------
  // Nudges the real number input, which stays uncontrolled so React's
  // post-action reset still restores the submitted value.
  const capacityInput = useRef<HTMLInputElement>(null);
  const stepCapacity = (delta: 1 | -1) => {
    const input = capacityInput.current;
    if (!input) return;
    const current = Number.parseInt(input.value, 10);
    const next = Number.isFinite(current) ? current + delta : MIN_CAPACITY;
    input.value = String(Math.max(MIN_CAPACITY, next));
    refreshDraft();
  };

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
    const describedBy = [hasHint && ids(field).hint, error && ids(field).error].filter(Boolean).join(" ");
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };
  const errorCount = Object.values(state.fieldErrors ?? {}).filter(
    (messages) => messages && messages.length > 0,
  ).length;

  // --- What is done, and what is still needed --------------------------------
  const capacity = Number.parseInt(draft.capacity, 10);
  const needed: string[] = [];
  if (!draft.departmentCode.trim() || !draft.courseNumber.trim()) needed.push("course");
  if (!draft.topic.trim()) needed.push("topic");
  if (!draft.placeId) needed.push("place");
  if (!draft.locationLabel.trim()) needed.push("location name");
  if (!draft.startsAt) needed.push("time");
  if (!(capacity >= MIN_CAPACITY)) needed.push("seats");
  const courseDone = !needed.includes("course") && !needed.includes("topic");
  const whereDone = !needed.includes("place") && !needed.includes("location name");
  const whenDone = !needed.includes("time") && !needed.includes("seats");

  const previewSession: SessionListItem = {
    id: "preview",
    course: {
      departmentCode: draft.departmentCode.trim().toUpperCase() || "",
      number: draft.courseNumber.trim().toUpperCase(),
      title: null,
    },
    topic: draft.topic.trim() || "What are you studying?",
    locationLabel: draft.locationLabel.trim() || "Place",
    room: draft.room.trim() || null,
    startsAt: draft.startsAt || new Date(now.getTime() + 3_600_000).toISOString(),
    endsAt: draft.endsAt || new Date(now.getTime() + 7_200_000).toISOString(),
    capacity: capacity >= MIN_CAPACITY ? capacity : MIN_CAPACITY,
    attendeeCount: 1,
    seatsLeft: Math.max(0, (capacity >= MIN_CAPACITY ? capacity : MIN_CAPACITY) - 1),
    hostDisplayName: hostName,
    hostId: "you",
    going: [{ userId: "you", displayName: hostName }],
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onInput={refreshDraft}
      onChange={refreshDraft}
      className="flex flex-wrap items-start gap-4"
    >
      <div className="min-w-0 flex-[1_1_560px] overflow-visible rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
        {/* ----------------------------------------------------------- Course */}
        <fieldset className={STEP}>
          <legend className="contents">
            <StepTitle n={1} done={courseDone}>
              Course
            </StepTitle>
          </legend>

          <div className={FIELD}>
            <p className={LABEL} aria-hidden>
              Department and number
            </p>
            <div className="flex gap-2">
              <div className="w-[38%] min-w-[96px] shrink-0 sm:w-[112px]">
                <label htmlFor={`${prefix}-department`} className="sr-only">
                  Department
                </label>
                <select
                  ref={departmentSelect}
                  id={`${prefix}-department`}
                  // While adding, the text input below submits departmentCode.
                  name={adding ? undefined : "departmentCode"}
                  value={departmentChoice}
                  onInput={chooseDepartment}
                  onChange={chooseDepartment}
                  required
                  {...(adding ? {} : a11y("departmentCode"))}
                  className={`${SELECT} font-semibold`}
                >
                  <option value="">Dept</option>
                  {departments.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.name ? `${department.code} — ${department.name}` : department.code}
                    </option>
                  ))}
                  <option value={ADD_DEPARTMENT}>Add a department…</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <label htmlFor={ids("courseNumber").input} className="sr-only">
                  Course number
                </label>
                <CourseNumberInput
                  id={ids("courseNumber").input}
                  departmentCode={departmentCode}
                  defaultValue={initialState.values?.courseNumber}
                  placeholder="Number, like 3251"
                  {...a11y("courseNumber", true)}
                  className={INPUT}
                />
              </div>
            </div>
            <p id={ids("courseNumber").hint} className="sr-only">
              Like 3251, or 1601L for a lab.
            </p>
            {!adding && <FieldError id={ids("departmentCode").error} message={errorFor("departmentCode")} />}
            <FieldError id={ids("courseNumber").error} message={errorFor("courseNumber")} />
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
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <label htmlFor={ids("topic").input} className={LABEL}>
                What are you studying?
              </label>
              <span className="text-xs text-ink-2">Shown as the session title</span>
            </div>
            <input
              ref={topicInput}
              id={ids("topic").input}
              name="topic"
              type="text"
              defaultValue={values.topic}
              required
              maxLength={TOPIC_MAX_LENGTH}
              placeholder="Midterm 2 review"
              {...a11y("topic")}
              className={INPUT}
            />
            <div className="flex flex-wrap gap-1.5" aria-label="Topic ideas" role="group">
              {TOPIC_SUGGESTIONS.map((topic) => (
                <button key={topic} type="button" onClick={() => applyTopic(topic)} className={CHIP}>
                  {topic}
                </button>
              ))}
            </div>
            <FieldError id={ids("topic").error} message={errorFor("topic")} />
          </div>
        </fieldset>

        {/* ------------------------------------------------------------ Where */}
        <fieldset className={STEP}>
          <legend className="contents">
            <StepTitle n={2} done={whereDone}>
              Where
            </StepTitle>
          </legend>
          <LocationPicker
            id={ids("placeId").input}
            defaultValue={initialPlace}
            onSelect={onPlaceSelect}
            required
            mapLayout="side"
            {...a11y("placeId")}
            header={
              <>
                <label htmlFor={ids("placeId").input} className={LABEL}>
                  Place
                </label>
                <FieldError id={ids("placeId").error} message={errorFor("placeId")} />
              </>
            }
            beside={
              <>
                <div className={FIELD}>
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <label htmlFor={ids("locationLabel").input} className={LABEL}>
                      Location name
                    </label>
                    <span className="text-xs text-ink-2">What students call it</span>
                  </div>
                  <p id={ids("locationLabel").hint} className="sr-only">
                    Shown on the session. Filled in from the place; change it to what students call it.
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
                    placeholder="Featheringill Hall"
                    {...a11y("locationLabel", true)}
                    className={INPUT}
                  />
                  <FieldError id={ids("locationLabel").error} message={errorFor("locationLabel")} />
                </div>
                <div className={FIELD}>
                  <div className="flex flex-wrap items-baseline gap-x-1.5">
                    <label htmlFor={ids("room").input} className={LABEL}>
                      Room
                    </label>
                    <span className="text-xs text-ink-2">Optional</span>
                  </div>
                  <input
                    id={ids("room").input}
                    name="room"
                    type="text"
                    defaultValue={values.room}
                    maxLength={ROOM_MAX_LENGTH}
                    placeholder="2nd floor study area"
                    {...a11y("room")}
                    className={INPUT}
                  />
                  <FieldError id={ids("room").error} message={errorFor("room")} />
                </div>
              </>
            }
          />
        </fieldset>

        {/* ---------------------------------------------------- When and seats */}
        <fieldset className={STEP}>
          <legend className="contents">
            <StepTitle n={3} done={whenDone}>
              When and seats
            </StepTitle>
          </legend>

          <div className={FIELD}>
            <p id={`${prefix}-day-label`} className={LABEL}>
              Day <span className="font-normal text-ink-2">This week, campus time</span>
            </p>
            <div role="radiogroup" aria-labelledby={`${prefix}-day-label`} className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {days.map((d) => {
                const on = !later && date === d.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={d.label === "Today" ? `Today, ${d.day}` : `${d.label} ${d.day}`}
                    onClick={() => {
                      setLater(false);
                      setDate(d.date);
                    }}
                    className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                      on ? "border-accent bg-[#F3F6FE] text-accent" : "border-line bg-white text-ink-2 hover:border-line-strong"
                    }`}
                  >
                    {d.label}
                    <span className={`text-[15px] leading-tight font-semibold ${on ? "text-accent" : "text-ink"}`}>{d.day}</span>
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={later}
                onClick={() => setLater(true)}
                className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                  later ? "border-accent bg-[#F3F6FE] text-accent" : "border-line bg-white text-ink-2 hover:border-line-strong"
                }`}
              >
                Later
                <span className={`text-[13px] leading-tight font-semibold ${later ? "text-accent" : "text-ink"}`}>Pick date</span>
              </button>
            </div>
            {later && (
              <div className="mt-1 max-w-[220px]">
                <label htmlFor={`${prefix}-later`} className="sr-only">
                  Date
                </label>
                <input
                  id={`${prefix}-later`}
                  type="date"
                  value={days.some((d) => d.date === date) ? "" : date}
                  min={days[0].date}
                  onChange={(event) => setDate(event.target.value)}
                  className={INPUT}
                />
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,160px)_minmax(0,1fr)_auto] sm:items-end">
            <div className={FIELD}>
              <label htmlFor={ids("startsAt").input} className={LABEL}>
                Starts
              </label>
              <input
                id={ids("startsAt").input}
                type="time"
                step={900}
                value={time}
                onChange={(event) => setTime(event.target.value)}
                required
                {...a11y("startsAt")}
                className={INPUT}
              />
            </div>

            <div className={FIELD}>
              <p id={`${prefix}-length-label`} className={LABEL}>
                Length <span className="font-normal text-ink-2">{endsHint(date, time, minutes)}</span>
              </p>
              <div
                role="radiogroup"
                aria-labelledby={`${prefix}-length-label`}
                className="grid h-11 grid-cols-4 gap-0.5 rounded-lg bg-column p-0.5 lg:h-9"
              >
                {LENGTHS.map((length) => {
                  const on = minutes === length;
                  return (
                    <button
                      key={length}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setMinutes(length)}
                      className={`rounded-md text-[13px] font-medium ${
                        on ? "bg-white text-ink shadow-[0_1px_2px_rgba(17,24,39,0.08)]" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {formatLength(length)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={FIELD}>
              <div className="flex flex-wrap items-baseline gap-x-1.5">
                <label htmlFor={ids("capacity").input} className={LABEL}>
                  People
                </label>
                <span className="text-xs text-ink-2">Including you</span>
              </div>
              <p id={ids("capacity").hint} className="sr-only">
                At least {MIN_CAPACITY}; you count as one.
              </p>
              <div className="flex h-11 items-center gap-1 rounded-lg border border-line bg-white px-1 lg:h-9">
                <button type="button" onClick={() => stepCapacity(-1)} aria-label="One fewer person" className={STEP_BUTTON}>
                  <Icon name="minus" />
                </button>
                <input
                  ref={capacityInput}
                  id={ids("capacity").input}
                  name="capacity"
                  type="number"
                  inputMode="numeric"
                  defaultValue={values.capacity ?? String(DEFAULT_CAPACITY)}
                  required
                  min={MIN_CAPACITY}
                  step={1}
                  {...a11y("capacity", true)}
                  className="h-full w-10 min-w-0 bg-transparent text-center text-base font-semibold text-ink outline-none [appearance:textfield] lg:text-sm [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button type="button" onClick={() => stepCapacity(1)} aria-label="One more person" className={STEP_BUTTON}>
                  <Icon name="plus" />
                </button>
              </div>
            </div>
          </div>
          <input type="hidden" name="startsAt" value={startsAt} />
          <input type="hidden" name="endsAt" value={endsAt} />
          <FieldError id={ids("startsAt").error} message={errorFor("startsAt")} />
          <FieldError id={ids("endsAt").error} message={errorFor("endsAt")} />
          <FieldError id={ids("capacity").error} message={errorFor("capacity")} />
        </fieldset>
      </div>

      {/* ------------------------------------------- Preview and submit */}
      <aside className="glass sticky top-20 flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-[rgba(17,24,39,0.06)] p-4 lg:max-w-[340px]">
        <p className="text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase">Preview</p>
        <div aria-hidden>
          <SessionCard session={previewSession} now={now} viewerId="you" relationFirst asPreview showDay />
        </div>
        {needed.length > 0 ? (
          <p className="flex items-start gap-1.5 text-[13px] text-ink-2">
            <span className="pt-0.5">
              <Icon name="alert" size={14} />
            </span>
            Still needed: {needed.join(", ")}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-seat">
            <Icon name="check" size={14} />
            Ready to post
          </p>
        )}
        {state.formError && (
          <p role="alert" className={PAGE_ALERT}>
            {state.formError}
          </p>
        )}
        {errorCount > 0 && (
          <p role="alert" className={PAGE_ALERT}>
            {errorCount === 1 ? "Check the field marked." : `Check the ${errorCount} fields marked.`}
          </p>
        )}
        <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} w-full disabled:cursor-wait`}>
          {pending ? "Creating session…" : "Create session"}
        </button>
      </aside>
    </form>
  );
}

function StepTitle({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2.5 text-[15px] font-semibold text-ink">
      {done ? (
        <span className="flex size-6 items-center justify-center rounded-full bg-seat text-white">
          <Icon name="check" size={13} />
          <span className="sr-only">Done:</span>
        </span>
      ) : (
        <span className="flex size-6 items-center justify-center rounded-full border border-line bg-white text-xs font-medium text-ink-2">
          {n}
        </span>
      )}
      {children}
    </span>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={FIELD_ERROR}>
      {message}
    </p>
  );
}
