"use client";

/**
 * The sign-in form (US-01). Owner: Track A -- A3 (#16).
 *
 * `useActionState(signIn, ...)` with signIn from src/app/login/actions.ts.
 * There is no redirect on success: the link has to be opened from the
 * student's inbox, so the form swaps itself for a "check your inbox" panel
 * driven by `state.sentTo`.
 *
 * Field name is signInSchema's key, exactly: `email`. The hidden `next` field
 * carries where the student was headed, so the magic link returns them there
 * instead of the default landing page; signIn() refuses anything off-site
 * (src/lib/redirects.ts).
 *
 * Errors follow the house pattern from <CreateSessionForm>: `role="alert"`,
 * linked by `aria-describedby`, `aria-invalid` on the input, and a
 * form-level message above the button.
 *
 * Mobile first (ADR 0004): 44px controls (`min-h-11`) and `text-base` on the
 * input so iOS Safari does not zoom on focus.
 *
 * `noValidate`: every message comes from signInSchema, worded once, rather
 * than from the browser's own validation bubble. `type="email"` and
 * `required` stay for the keyboard and for assistive technology.
 */

import { useActionState, useId } from "react";

import { signIn, type SignInState } from "@/app/login/actions";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/env";

const INPUT =
  "block min-h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-base " +
  "aria-[invalid=true]:border-red-600 dark:border-neutral-700 dark:bg-neutral-900 " +
  "dark:aria-[invalid=true]:border-red-400";

export type SignInFormProps = {
  /**
   * Where to go once signed in, as a same-origin path. Comes from the proxy's
   * `?next=` when it turned a signed-out visitor away.
   */
  next?: string;
  /** A message about the attempt as a whole, e.g. a link that had expired. */
  notice?: string;
  /** useActionState's starting state. Tests pass one with errors or `sentTo`. */
  initialState?: SignInState;
};

export default function SignInForm({
  next,
  notice,
  initialState = {},
}: SignInFormProps) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const prefix = useId();
  const inputId = `${prefix}-email`;
  const hintId = `${prefix}-email-hint`;
  const errorId = `${prefix}-email-error`;

  const fieldError = state.fieldErrors?.email?.[0];

  // A link has gone out. Say so, and stop offering the form: submitting it
  // again would only send a second link and invalidate this one.
  if (state.sentTo) {
    return (
      <div
        // Announced on arrival: the form it replaced had focus.
        role="status"
        className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800"
      >
        <h2 className="text-lg font-semibold">Check your inbox</h2>
        <p className="mt-2 text-base text-neutral-600 dark:text-neutral-400">
          We sent a sign-in link to{" "}
          <strong className="font-medium text-neutral-900 dark:text-neutral-100">
            {state.sentTo}
          </strong>
          . Open it on this device to finish signing in.
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          The link works once and expires after an hour. Nothing arrived? Check
          your spam folder, then{" "}
          <a
            href="/login"
            className="underline underline-offset-2 hover:no-underline"
          >
            try again
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col gap-5">
      {notice && (
        <p
          role="alert"
          className="rounded-md bg-amber-50 px-3 py-2 text-base text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {notice}
        </p>
      )}

      {next && <input type="hidden" name="next" value={next} />}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="block text-base font-medium">
          Vanderbilt email
        </label>
        <p
          id={hintId}
          className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400"
        >
          We&apos;ll email you a link that signs you in. No password.
        </p>
        <input
          id={inputId}
          name="email"
          type="email"
          defaultValue={state.values?.email}
          required
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          autoFocus
          placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
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
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
