"use client";

/**
 * The sign-in form (US-01). Built by A3 (#16); rendered by
 * src/app/login/page.tsx. Two steps, one component:
 *
 *   1. EMAIL -- `useActionState(signIn, {})`. signIn never redirects: once
 *      the email has gone out it returns `{ sentTo }`, and the code step
 *      replaces this one.
 *   2. CODE -- "Check your inbox", naming the address, with a field for the
 *      one-time code from the email: `useActionState(verifyCode, {})`,
 *      which redirects on success. The same email has a link that signs in
 *      without the code; why both, and the catch (they are one token), is
 *      at verifyCode() in src/app/login/actions.ts. "Use a different email"
 *      goes back to step 1 without a round trip.
 *
 * Field names are the schemas' keys: `email`, `code`, plus a hidden `next`
 * when the page was given a safe one (the page checks it; the actions check
 * it again). Step 2 carries the email and `next` in hidden fields.
 *
 * Same idiom as CreateSessionForm: `noValidate` so every message comes from
 * the schema; the error beside its input with `role="alert"`, linked by
 * `aria-describedby`, `aria-invalid` on the input; submitted values fed back
 * as `defaultValue` because React resets the form after the action. Mobile
 * first (ADR 0004): 44px controls, `text-base` inputs so iOS Safari does not
 * zoom.
 */

import { useActionState, useId, useState } from "react";

import {
  signIn,
  verifyCode,
  type SignInState,
  type VerifyCodeState,
} from "@/app/login/actions";

const INPUT =
  "block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:aria-[invalid=true]:border-red-400";
const LABEL = "block text-base font-medium";
const HINT = "text-sm text-neutral-600 dark:text-neutral-400";
const FIELD_ERROR = "text-sm text-red-700 dark:text-red-400";
const FORM_ERROR = "text-base text-red-700 dark:text-red-400";
const BUTTON =
  "min-h-11 rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 " +
  "disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";
const SECONDARY =
  "min-h-11 rounded-md border border-neutral-300 px-5 text-base font-medium hover:bg-neutral-100 " +
  "dark:border-neutral-700 dark:hover:bg-neutral-800";

export type SignInFormProps = {
  /** A same-origin path to return to after signing in; already checked. */
  next?: string;
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: SignInState;
};

export default function SignInForm({ next, initialState = {} }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  // The state whose code step the student left with "Use a different
  // email". A new send produces a new state object, so its step shows again.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);
  // Bumped on every new send, to remount the code step with a fresh
  // useActionState -- no stale "that code didn't work" from the last email.
  const [seen, setSeen] = useState(state);
  const [round, setRound] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setRound(round + 1);
  }

  if (state.sentTo && dismissed !== state) {
    return (
      <CodeStep
        key={round}
        email={state.sentTo}
        next={next}
        onChangeEmail={() => setDismissed(state)}
      />
    );
  }
  return <EmailStep state={state} formAction={formAction} pending={pending} next={next} />;
}

function EmailStep({
  state,
  formAction,
  pending,
  next,
}: {
  state: SignInState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  next?: string;
}) {
  const prefix = useId();
  const ids = { email: `${prefix}-email`, hint: `${prefix}-hint`, error: `${prefix}-error` };
  const error = state.fieldErrors?.email?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.email} className={LABEL}>
          Vanderbilt email
        </label>
        <p id={ids.hint} className={HINT}>
          Only @vanderbilt.edu addresses can sign in. We&apos;ll email you a sign-in code and
          link — no password.
        </p>
        <input
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@vanderbilt.edu"
          required
          defaultValue={state.values?.email ?? state.sentTo ?? ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
          className={INPUT}
        />
        {error && (
          <p id={ids.error} role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}
      </div>
      {state.formError && (
        <p role="alert" className={FORM_ERROR}>
          {state.formError}
        </p>
      )}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "Sending…" : "Email me a sign-in code"}
      </button>
    </form>
  );
}

function CodeStep({
  email,
  next,
  onChangeEmail,
}: {
  email: string;
  next?: string;
  onChangeEmail: () => void;
}) {
  const [state, formAction, pending] = useActionState<VerifyCodeState, FormData>(
    verifyCode,
    {},
  );
  const prefix = useId();
  const ids = {
    heading: `${prefix}-heading`,
    code: `${prefix}-code`,
    hint: `${prefix}-hint`,
    error: `${prefix}-error`,
  };
  // The email is a hidden field, so an error on it (only possible if the
  // page was tampered with) is shown with the form's.
  const formError = state.formError ?? state.fieldErrors?.email?.[0];
  const error = state.fieldErrors?.code?.[0];

  return (
    <section aria-labelledby={ids.heading} className="flex flex-col gap-4">
      <h2 id={ids.heading} className="text-xl font-semibold">
        Check your inbox
      </h2>
      {/* role="status" so a screen reader announces the change of step. */}
      <p role="status" className="text-base">
        We sent a sign-in code and link to <strong className="break-all">{email}</strong>. Enter
        the code below, or open the link in the email. Either works once, for an hour.
      </p>
      <form action={formAction} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="email" value={email} />
        {next && <input type="hidden" name="next" value={next} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.code} className={LABEL}>
            Sign-in code
          </label>
          <p id={ids.hint} className={HINT}>
            The number in the email. Nothing there? Check your junk folder, or wait a minute and
            ask for another.
          </p>
          <input
            id={ids.code}
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoCapitalize="none"
            spellCheck={false}
            required
            defaultValue={state.values?.code ?? ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
            className={`${INPUT} tracking-widest`}
          />
          {error && (
            <p id={ids.error} role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className={FORM_ERROR}>
            {formError}
          </p>
        )}
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>
      <button type="button" onClick={onChangeEmail} className={SECONDARY}>
        Use a different email
      </button>
    </section>
  );
}
