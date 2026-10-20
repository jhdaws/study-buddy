"use client";

/**
 * The first-sign-in name step's form (US-01, ADR 0008 rule 1). Built by A4
 * (#17); rendered by src/app/login/name/page.tsx inside <AuthScene>.
 * Restyled to the Claude Design spec (pages 14, 17).
 *
 * `useActionState(saveDisplayName, {})` with saveDisplayName from
 * src/app/login/actions.ts, which redirects on success. Field names are
 * displayNameSchema's: `displayName`, plus a hidden `next` when the page was
 * given a safe one.
 *
 * The input is controlled only to drive the live "n/50" counter (announced
 * politely); a controlled input also keeps what was typed across a refused
 * submit. The length comes from @/lib/limits, not @/lib/validation, so zod
 * stays out of the browser bundle.
 */

import { useActionState, useId, useState } from "react";

import { saveDisplayName, type DisplayNameState } from "@/app/login/actions";
import {
  BUTTON_ON_DARK,
  FIELD,
  FIELD_ERROR_ON_DARK,
  FORM_ERROR_ON_DARK,
  INPUT_ON_DARK,
  LABEL_ON_DARK,
} from "@/components/ui/styles";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/limits";

export type DisplayNameFormProps = {
  /** A same-origin path to go on to afterwards; already checked. */
  next?: string;
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: DisplayNameState;
};

export default function DisplayNameForm({ next, initialState = {} }: DisplayNameFormProps) {
  const [state, formAction, pending] = useActionState(saveDisplayName, initialState);
  const [name, setName] = useState(state.values?.displayName ?? "");
  const [echoed, setEchoed] = useState(state);
  if (echoed !== state) {
    setEchoed(state);
    if (state.values?.displayName !== undefined) setName(state.values.displayName);
  }

  const prefix = useId();
  const ids = {
    input: `${prefix}-name`,
    hint: `${prefix}-hint`,
    count: `${prefix}-count`,
    error: `${prefix}-error`,
  };
  const error = state.fieldErrors?.displayName?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className={FIELD}>
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.input} className={LABEL_ON_DARK}>
            Display name
          </label>
          <span id={ids.count} aria-live="polite" className="px-1 text-sm text-white/72">
            {name.length}/{DISPLAY_NAME_MAX_LENGTH}
          </span>
        </div>
        <input
          id={ids.input}
          name="displayName"
          type="text"
          autoComplete="nickname"
          placeholder="e.g. Moses"
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
          className={INPUT_ON_DARK}
        />
        <p id={ids.hint} className="px-1 text-sm text-white/72">
          Your first name is fine. Up to {DISPLAY_NAME_MAX_LENGTH} characters.
        </p>
        {error && (
          <p id={ids.error} role="alert" className={FIELD_ERROR_ON_DARK}>
            {error}
          </p>
        )}
      </div>
      {state.formError && (
        <p role="alert" className={FORM_ERROR_ON_DARK}>
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${BUTTON_ON_DARK} w-full`}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
