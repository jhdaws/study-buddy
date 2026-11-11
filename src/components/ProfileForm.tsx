"use client";

/**
 * The academic-profile form (US-11), on /profile. Posts to saveProfile()
 * (src/app/profile/actions.ts) with `useActionState`.
 *
 * Field names are profileSchema's keys (src/lib/validation.ts):
 *   major, minor   optional text, uncontrolled; `state.values` refills them
 *                  after React's post-action form reset.
 *   classYear      an uncontrolled <select> with `key` + `defaultValue`, the
 *                  pattern validation.ts's FormState comment describes, so
 *                  the reset puts back the submitted year rather than the
 *                  first option. "" is "Prefer not to say".
 *   courses        one HIDDEN input per listed course (`CS 3251`), rendered
 *                  from React state. Controlled hidden inputs survive the
 *                  reset; after a save the list is replaced by the server's
 *                  normalised copy (`state.courses`).
 *
 * Adding a course: a department <select> (`courseDepartment`) and the
 * session form's typeahead, <CourseNumberInput> (`courseNumber`), then Add.
 * Both are submitted too, so a course typed but never added -- Enter pressed
 * in the number field -- is saved rather than silently dropped. The select is
 * controlled (the typeahead reads it), so it updates on `input` as well as
 * `change` (BUG-15) and mirrors its value into `defaultSelected` so the form
 * reset cannot desynchronise it -- both as in <CreateSessionForm>. Only
 * departments already listed are offered: a student taking a course in a
 * department nobody has added yet adds it by hosting a session.
 *
 * Every rule is checked again by the server and the database; the checks
 * here are for an immediate message. `noValidate`, so every message is worded
 * once. Mobile first (ADR 0004): one column, 44px controls, `text-base` on
 * every input.
 */

import { type FormEvent, useActionState, useEffect, useId, useRef, useState } from "react";

import { saveProfile, type ProfileState } from "@/app/profile/actions";
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
  SELECT,
} from "@/components/ui/styles";
import { CLASS_YEAR_LABELS, CLASS_YEARS, type ClassYear, courseKey } from "@/lib/academic";
import { MAJOR_MAX_LENGTH, MINOR_MAX_LENGTH, PROFILE_COURSES_MAX } from "@/lib/limits";
import type { CourseLabel, Department } from "@/lib/sessions";
// Types only: a value from validation.ts would ship zod to the browser.
import type { ProfileField } from "@/lib/validation";

const SECTION = "min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6";
const LEGEND = "float-left mb-4 w-full text-[17px] font-bold text-ink";
const GROUP = "clear-both flex flex-col gap-5";

/** The same shape the database stores; normalised the way S2 does it. */
const COURSE_NUMBER = /^[0-9]{4}[A-Z]?$/;
const normalise = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

export type ProfileFormProps = {
  /** From listDepartments(), for the "add a course" picker. */
  departments: Department[];
  /** What is saved now (getProfile()). */
  profile: {
    major: string | null;
    minor: string | null;
    classYear: ClassYear | null;
    courses: CourseLabel[];
  };
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: ProfileState;
};

export default function ProfileForm({ departments, profile, initialState = {} }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);
  const values = state.values ?? {};
  const prefix = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [courses, setCourses] = useState<string[]>(() => profile.courses.map(courseKey));
  const [department, setDepartment] = useState("");
  const [draftKey, setDraftKey] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);

  // A successful save: show the server's normalised list, and clear the
  // "add" row, which was submitted (and saved) along with the rest.
  const [echoed, setEchoed] = useState(state);
  if (echoed !== state) {
    setEchoed(state);
    if (state.saved && state.courses) {
      setCourses(state.courses);
      setDepartment("");
      setDraftKey((key) => key + 1);
      setAddError(null);
    }
  }

  // Survive React's post-action form reset (see <CreateSessionForm>).
  const departmentSelect = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    for (const option of departmentSelect.current?.options ?? []) {
      option.defaultSelected = option.value === department;
    }
  }, [department, departments]);
  // On `input` as well as `change`: BUG-15.
  const chooseDepartment = (event: FormEvent<HTMLSelectElement>) =>
    setDepartment(event.currentTarget.value);

  const full = courses.length >= PROFILE_COURSES_MAX;

  function addCourse() {
    const input = formRef.current?.elements.namedItem("courseNumber");
    const number = normalise(input instanceof HTMLInputElement ? input.value : "");
    if (department === "") {
      setAddError("Choose the course's department first.");
      return;
    }
    if (!COURSE_NUMBER.test(number)) {
      setAddError("Enter a 4-digit course number, like 3251 or 2100W.");
      return;
    }
    const key = `${department} ${number}`;
    if (!courses.includes(key)) {
      if (full) {
        setAddError(`List up to ${PROFILE_COURSES_MAX} current courses.`);
        return;
      }
      setCourses([...courses, key]);
    }
    setAddError(null);
    // A new key remounts the typeahead, which empties it for the next course.
    setDraftKey((key) => key + 1);
  }

  const ids = (field: string) => ({
    input: `${prefix}-${field}`,
    hint: `${prefix}-${field}-hint`,
    error: `${prefix}-${field}-error`,
  });
  const errorFor = (field: ProfileField) => state.fieldErrors?.[field]?.[0];
  const a11y = (field: ProfileField, hasHint = false) => {
    const error = errorFor(field);
    const describedBy = [hasHint && ids(field).hint, error && ids(field).error]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
    };
  };
  const coursesError = errorFor("courses");
  const classYear = values.classYear ?? profile.classYear ?? "";

  return (
    <form ref={formRef} action={formAction} noValidate className="flex flex-col gap-5">
      <fieldset className={SECTION}>
        <legend className={LEGEND}>Studies</legend>
        <div className={GROUP}>
          <div className={FIELD}>
            <label htmlFor={ids("major").input} className={LABEL}>
              Major <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <input
              id={ids("major").input}
              name="major"
              type="text"
              defaultValue={values.major ?? profile.major ?? ""}
              maxLength={MAJOR_MAX_LENGTH}
              autoComplete="off"
              placeholder="e.g. Computer Science"
              {...a11y("major")}
              className={INPUT}
            />
            <FieldError id={ids("major").error} message={errorFor("major")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("minor").input} className={LABEL}>
              Minor <span className="font-normal text-ink-2">(optional)</span>
            </label>
            <input
              id={ids("minor").input}
              name="minor"
              type="text"
              defaultValue={values.minor ?? profile.minor ?? ""}
              maxLength={MINOR_MAX_LENGTH}
              autoComplete="off"
              {...a11y("minor")}
              className={INPUT}
            />
            <FieldError id={ids("minor").error} message={errorFor("minor")} />
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("classYear").input} className={LABEL}>
              Year
            </label>
            <select
              key={classYear}
              id={ids("classYear").input}
              name="classYear"
              defaultValue={classYear}
              {...a11y("classYear")}
              className={SELECT}
            >
              <option value="">Prefer not to say</option>
              {CLASS_YEARS.map((year) => (
                <option key={year} value={year}>
                  {CLASS_YEAR_LABELS[year]}
                </option>
              ))}
            </select>
            <FieldError id={ids("classYear").error} message={errorFor("classYear")} />
          </div>
        </div>
      </fieldset>

      <fieldset className={SECTION} aria-describedby={ids("courses").hint}>
        <legend className={LEGEND}>Current courses</legend>
        <div className={GROUP}>
          <p id={ids("courses").hint} className={HINT}>
            What you&apos;re taking this semester, up to {PROFILE_COURSES_MAX}.
          </p>

          {courses.length === 0 ? (
            <p className="text-[15px] text-ink-2">No courses listed yet.</p>
          ) : (
            <ul aria-label="Your current courses" className="flex flex-col divide-y divide-line">
              {courses.map((course) => (
                <li key={course} className="flex min-h-12 items-center justify-between gap-3 py-1">
                  <span className="text-[15px] font-semibold text-ink">{course}</span>
                  <input type="hidden" name="courses" value={course} />
                  <button
                    type="button"
                    aria-label={`Remove ${course}`}
                    onClick={() => setCourses(courses.filter((other) => other !== course))}
                    className={BUTTON_SECONDARY}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={FIELD}>
            <label htmlFor={ids("courseDepartment").input} className={LABEL}>
              Department
            </label>
            <select
              ref={departmentSelect}
              id={ids("courseDepartment").input}
              name="courseDepartment"
              value={department}
              onInput={chooseDepartment}
              onChange={chooseDepartment}
              disabled={full}
              className={SELECT}
            >
              <option value="">Choose a department</option>
              {departments.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.name ? `${option.code} — ${option.name}` : option.code}
                </option>
              ))}
            </select>
          </div>

          <div className={FIELD}>
            <label htmlFor={ids("courseNumber").input} className={LABEL}>
              Course number
            </label>
            <CourseNumberInput
              key={draftKey}
              id={ids("courseNumber").input}
              departmentCode={department}
              aria-invalid={addError ? true : undefined}
              aria-describedby={addError ? ids("courseNumber").error : undefined}
              className={INPUT}
            />
            <FieldError id={ids("courseNumber").error} message={addError ?? undefined} />
          </div>

          <button
            type="button"
            onClick={addCourse}
            disabled={full}
            className={`${BUTTON_SECONDARY} w-full sm:w-auto sm:self-start`}
          >
            Add course
          </button>
          {full && (
            <p className={HINT}>That&apos;s the most a profile lists. Remove one to add another.</p>
          )}
          <FieldError id={ids("courses").error} message={coursesError} />
        </div>
      </fieldset>

      {state.formError && (
        <p role="alert" className={FORM_ERROR}>
          {state.formError}
        </p>
      )}
      {state.saved && !pending && (
        <p role="status" className="rounded-xl bg-paper px-4 py-3 text-[15px] font-semibold text-ink">
          Profile saved.
        </p>
      )}

      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} w-full sm:w-auto sm:self-start`}>
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={FIELD_ERROR}>
      {message}
    </p>
  );
}
