"use client";

/**
 * The choose-a-password step's form (US-01, A6); rendered by
 * src/app/login/password/page.tsx inside <AuthScene>. Same idiom as
 * DisplayNameForm.
 *
 * `useActionState(setPassword, {})` with setPassword from
 * src/app/login/actions.ts, which redirects on success. Field names are
 * setPasswordSchema's: `password` and `confirmPassword`, plus a hidden
 * `next` when the page was given a safe one. The password is typed twice
 * because getting it wrong costs an email to fix.
 *
 * The server never sends a password back, so after a refused submit both
 * fields are empty again (React resets the form) and the error says why.
 * The length rule comes from @/lib/limits, not @/lib/validation, so zod
 * stays out of the browser bundle.
 */

import { useActionState, useId } from "react";

import { setPassword, type SetPasswordState } from "@/app/login/actions";
import {
  BUTTON_ON_DARK,
  FIELD,
  FIELD_ERROR_ON_DARK,
  FORM_ERROR_ON_DARK,
  INPUT_ON_DARK,
  LABEL_ON_DARK,
} from "@/components/ui/styles";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/limits";

export type SetPasswordFormProps = {
  /** A same-origin path to go on to afterwards; already checked. */
  next?: string;
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: SetPasswordState;
};

export default function SetPasswordForm({ next, initialState = {} }: SetPasswordFormProps) {
  const [state, formAction, pending] = useActionState(setPassword, initialState);

  const prefix = useId();
  const ids = {
    password: `${prefix}-password`,
    hint: `${prefix}-hint`,
    passwordError: `${prefix}-password-error`,
    confirm: `${prefix}-confirm`,
    confirmError: `${prefix}-confirm-error`,
  };
  const passwordError = state.fieldErrors?.password?.[0];
  const confirmError = state.fieldErrors?.confirmPassword?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className={FIELD}>
        <label htmlFor={ids.password} className={LABEL_ON_DARK}>
          New password
        </label>
        <input
          id={ids.password}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          required
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={[ids.hint, passwordError && ids.passwordError].filter(Boolean).join(" ")}
          className={INPUT_ON_DARK}
        />
        <p id={ids.hint} className="px-1 text-sm text-white/72">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
        {passwordError && (
          <p id={ids.passwordError} role="alert" className={FIELD_ERROR_ON_DARK}>
            {passwordError}
          </p>
        )}
      </div>
      <div className={FIELD}>
        <label htmlFor={ids.confirm} className={LABEL_ON_DARK}>
          Type it again
        </label>
        <input
          id={ids.confirm}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX_LENGTH}
          required
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? ids.confirmError : undefined}
          className={INPUT_ON_DARK}
        />
        {confirmError && (
          <p id={ids.confirmError} role="alert" className={FIELD_ERROR_ON_DARK}>
            {confirmError}
          </p>
        )}
      </div>
      {state.formError && (
        <p role="alert" className={FORM_ERROR_ON_DARK}>
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${BUTTON_ON_DARK} w-full`}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
