"use client";

/**
 * The create-session form (US-02, T-D7).
 *
 * Submits to the createSession server action, which validates with the same
 * schema this component uses and records the session in the in-memory demo
 * store. T-E2 repoints that action at the real tables (T-C2, T-C3, T-C4); this
 * component should not need to change when it does.
 *
 * Mobile first (ADR 0004): single column, 44px tap targets, `text-base` on
 * every input so iOS Safari does not zoom on focus.
 */

import { useId, useState } from "react";

import { createSession } from "@/app/sessions/actions";
import {
  coursesForDepartment,
  DEPARTMENTS,
  LOCATIONS,
} from "@/lib/fixtures";
import {
  createSessionSchema,
  fieldErrors,
  MIN_CAPACITY,
  type FieldErrors,
} from "@/lib/validation";

const EMPTY_FORM = {
  departmentCode: "",
  courseNumber: "",
  topic: "",
  locationId: "",
  room: "",
  startsAt: "",
  endsAt: "",
  capacity: "4",
};

type FormState = typeof EMPTY_FORM;

const inputClass =
  "min-h-11 w-full rounded-lg border border-black/20 bg-transparent px-3 " +
  "text-base focus:border-black focus:outline-none focus:ring-2 " +
  "focus:ring-black/20 dark:border-white/25 dark:focus:border-white " +
  "dark:focus:ring-white/25";

export default function CreateSessionForm() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const courses = coursesForDepartment(form.departmentCode);

  function update<K extends keyof FormState>(field: K, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }));

    // Clear the error as soon as the student edits the field it belongs to.
    // Leaving it visible while they fix it reads as the form arguing back.
    setErrors((previous) => {
      if (!previous[field as keyof FieldErrors]) return previous;
      const next = { ...previous };
      delete next[field as keyof FieldErrors];
      return next;
    });
  }

  function handleDepartmentChange(code: string) {
    // The course list is scoped to the department, so a number chosen under
    // the old one is no longer offered and must not silently survive.
    setForm((previous) => ({
      ...previous,
      departmentCode: code,
      courseNumber: "",
    }));
    setErrors((previous) => ({ ...previous, departmentCode: undefined }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Checked here first so a mistake is reported without a round trip. The
    // action checks again, because this check is reachable only through our
    // own form and is therefore not enforcement.
    const local = createSessionSchema().safeParse(form);
    if (!local.success) {
      setErrors(fieldErrors(local.error));
      return;
    }

    setErrors({});
    setSubmitting(true);

    // On success the action redirects, so control does not come back here.
    const result = await createSession(form);

    setSubmitting(false);
    setErrors(result.errors);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <Field label="Department" error={errors.departmentCode}>
        {(props) => (
          <select
            {...props}
            className={inputClass}
            value={form.departmentCode}
            onChange={(event) => handleDepartmentChange(event.target.value)}
          >
            <option value="">Choose a department</option>
            {DEPARTMENTS.map((department) => (
              <option key={department.code} value={department.code}>
                {department.code} — {department.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="Course"
        error={errors.courseNumber}
        hint={
          form.departmentCode ? undefined : "Pick a department first."
        }
      >
        {(props) => (
          <select
            {...props}
            className={inputClass}
            value={form.courseNumber}
            disabled={!form.departmentCode}
            onChange={(event) => update("courseNumber", event.target.value)}
          >
            <option value="">Choose a course</option>
            {courses.map((course) => (
              <option key={course.number} value={course.number}>
                {course.departmentCode} {course.number} — {course.title}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="What are you studying?"
        error={errors.topic}
        hint="Exam 2 review, problem set 4, project pair programming…"
      >
        {(props) => (
          <input
            {...props}
            type="text"
            className={inputClass}
            value={form.topic}
            onChange={(event) => update("topic", event.target.value)}
          />
        )}
      </Field>

      <Field label="Where" error={errors.locationId}>
        {(props) => (
          <select
            {...props}
            className={inputClass}
            value={form.locationId}
            onChange={(event) => update("locationId", event.target.value)}
          >
            <option value="">Choose a place</option>
            {LOCATIONS.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Room or area" error={errors.room} hint="Optional.">
        {(props) => (
          <input
            {...props}
            type="text"
            className={inputClass}
            value={form.room}
            placeholder="134, third floor, back tables…"
            onChange={(event) => update("room", event.target.value)}
          />
        )}
      </Field>

      <Field label="Starts" error={errors.startsAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            value={form.startsAt}
            onChange={(event) => update("startsAt", event.target.value)}
          />
        )}
      </Field>

      <Field label="Ends" error={errors.endsAt}>
        {(props) => (
          <input
            {...props}
            type="datetime-local"
            className={inputClass}
            value={form.endsAt}
            onChange={(event) => update("endsAt", event.target.value)}
          />
        )}
      </Field>

      <Field
        label="How many people, including you?"
        error={errors.capacity}
        hint={`At least ${MIN_CAPACITY}.`}
      >
        {(props) => (
          <input
            {...props}
            type="number"
            inputMode="numeric"
            min={MIN_CAPACITY}
            className={inputClass}
            value={form.capacity}
            onChange={(event) => update("capacity", event.target.value)}
          />
        )}
      </Field>

      <button
        type="submit"
        disabled={submitting}
        className="min-h-11 rounded-lg bg-foreground px-4 text-base font-medium text-background focus:outline-none focus:ring-2 focus:ring-black/40 disabled:opacity-60 dark:focus:ring-white/40"
      >
        {submitting ? "Starting…" : "Start the session"}
      </button>
    </form>
  );
}

/**
 * Label, control, hint, and error for one field.
 *
 * The control is a render prop so it receives the generated `id` and the
 * `aria-invalid` / `aria-describedby` wiring without every call site
 * repeating it.
 */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>

      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy || undefined,
      })}

      {hint && (
        <p id={hintId} className="text-sm opacity-60">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
