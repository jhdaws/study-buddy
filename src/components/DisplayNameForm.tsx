"use client";

/**
 * The display-name step (US-01, ADR 0008 rule 1). Owner: Track A -- A4 (#17).
 *
 * `useActionState(saveDisplayName, ...)` with saveDisplayName from
 * src/app/login/actions.ts. On success the action redirects, so there is no
 * success state to render here.
 *
 * Field name is displayNameSchema's key, exactly: `displayName`, plus the
 * hidden `next` the action redirects to once the name is saved.
 *
 * Errors and layout follow the house pattern from <CreateSessionForm>:
 * `role="alert"`, linked by `aria-describedby`, `aria-invalid` on the input,
 * 44px controls and `text-base` (ADR 0004).
 */

import { useActionState, useId } from "react";

import { saveDisplayName, type DisplayNameState } from "@/app/login/actions";
// From @/lib/limits, not @/lib/validation: a Client Component importing a
// value from validation.ts ships zod and every locale with it.
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/limits";

const INPUT =
  "block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:aria-[invalid=true]:border-red-400";

export type DisplayNameFormProps = {
  /** Where to go once the name is saved, as a same-origin path. */
  next?: string;
  /** useActionState's starting state. Tests pass one with errors. */
  initialState?: DisplayNameState;
};

export default function DisplayNameForm({
  next,
  initialState = {},
}: DisplayNameFormProps) {
  const [state, formAction, pending] = useActionState(
    saveDisplayName,
    initialState,
  );
  const prefix = useId();
  const inputId = `${prefix}-display-name`;
  const hintId = `${prefix}-display-name-hint`;
  const errorId = `${prefix}-display-name-error`;

  const fieldError = state.fieldErrors?.displayName?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="block text-base font-medium">
          Display name
        </label>
        <p
          id={hintId}
          className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400"
        >
          Classmates see this on sessions you host and join. Your email stays
          private.
        </p>
        <input
          id={inputId}
          name="displayName"
          type="text"
          defaultValue={state.values?.displayName}
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="name"
          autoFocus
          placeholder="e.g. Priya"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={[hintId, fieldError && errorId]
            .filter(Boolean)
            .join(" ")}
          className={INPUT}
        />
        {fieldError && (
          <p id={errorId} role="alert" className="text-sm text-red-700 dark:text-red-400">
            {fieldError}
          </p>
        )}
      </div>

      {state.formError && (
        <p
          role="alert"
          className="rounded-md bg-red-50 px-3 py-2 text-base text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
