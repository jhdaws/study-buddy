"use client";

/**
 * The first-sign-in name step's form (US-01, ADR 0008 rule 1). Built by A4
 * (#17); rendered by src/app/login/name/page.tsx.
 *
 * `useActionState(saveDisplayName, {})` with saveDisplayName from
 * src/app/login/actions.ts, which redirects on success. Field names are
 * displayNameSchema's: `displayName`, plus a hidden `next` when the page was
 * given a safe one.
 *
 * Same idiom as CreateSessionForm and SignInForm: `noValidate`, the error
 * beside the input with `role="alert"` and `aria-describedby`, the submitted
 * value fed back as `defaultValue`, 44px controls, `text-base` input. The
 * length comes from @/lib/limits, not @/lib/validation, so zod stays out of
 * the browser bundle.
 */

import { useActionState, useId } from "react";

import { saveDisplayName, type DisplayNameState } from "@/app/login/actions";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/limits";

const INPUT =
  "block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:aria-[invalid=true]:border-red-400";
const BUTTON =
  "min-h-11 rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 " +
  "disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

export type DisplayNameFormProps = {
  /** A same-origin path to go on to afterwards; already checked. */
  next?: string;
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: DisplayNameState;
};

export default function DisplayNameForm({ next, initialState = {} }: DisplayNameFormProps) {
  const [state, formAction, pending] = useActionState(saveDisplayName, initialState);
  const prefix = useId();
  const ids = { input: `${prefix}-name`, hint: `${prefix}-hint`, error: `${prefix}-error` };
  const error = state.fieldErrors?.displayName?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.input} className="block text-base font-medium">
          Display name
        </label>
        <p id={ids.hint} className="text-sm text-neutral-600 dark:text-neutral-400">
          What other students see on sessions you host or join. Your first name is fine. Up to{" "}
          {DISPLAY_NAME_MAX_LENGTH} characters.
        </p>
        <input
          id={ids.input}
          name="displayName"
          type="text"
          autoComplete="nickname"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          required
          defaultValue={state.values?.displayName ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
          className={INPUT}
        />
        {error && (
          <p id={ids.error} role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      {state.formError && (
        <p role="alert" className="text-base text-red-700 dark:text-red-400">
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
