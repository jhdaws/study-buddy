"use client";

/**
 * The confirm step for deleting an account (US-24), on /account/delete.
 * `useActionState(deleteAccount, {})`; deleteAccount() redirects home on
 * success, so this only ever renders a refusal.
 *
 * One deliberate act before anything is deleted: tick the box, then press
 * the button. The box is checked again on the server (deleteAccountSchema),
 * so a form posted without it -- or with JavaScript off -- is refused too.
 * The form carries nothing else: whose account is deleted is decided by the
 * session, never by a field.
 *
 * Mobile first (ADR 0004): full-width 44px controls, and the whole label row
 * is the checkbox's tap target.
 */

import Link from "next/link";
import { useActionState, useId } from "react";

import { deleteAccount, type DeleteAccountState } from "@/app/account/actions";
import { BUTTON_SECONDARY, FIELD_ERROR, FORM_ERROR } from "@/components/ui/styles";

export default function DeleteAccountForm({
  initialState = {},
}: {
  /** useActionState's starting state. `{}` on the page; tests pass others. */
  initialState?: DeleteAccountState;
}) {
  const [state, formAction, pending] = useActionState(deleteAccount, initialState);
  const prefix = useId();
  const error = state.fieldErrors?.confirm?.[0];

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${prefix}-confirm`}
          className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] font-semibold text-ink"
        >
          <input
            id={`${prefix}-confirm`}
            name="confirm"
            type="checkbox"
            value="yes"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${prefix}-confirm-error` : undefined}
            className="size-6 shrink-0 accent-danger-on-light"
          />
          I understand my account and data can&apos;t be recovered.
        </label>
        {error && (
          <p id={`${prefix}-confirm-error`} role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}
      </div>

      {state.formError && (
        <p role="alert" className={FORM_ERROR}>
          {state.formError}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 min-h-11 w-full items-center justify-center rounded-xl bg-danger-on-light px-4 text-[15px] font-semibold text-white hover:bg-danger-on-light/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete my account"}
      </button>
      <Link href="/" className={`${BUTTON_SECONDARY} w-full`}>
        Keep my account
      </Link>
    </form>
  );
}
