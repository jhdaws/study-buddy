"use client";

/**
 * The sign-in form (US-01). Built by A3 (#16); rendered by
 * src/app/login/page.tsx inside <AuthScene>. Restyled to the Claude Design
 * spec (pages 9-16). Two steps, one component:
 *
 *   1. EMAIL -- `useActionState(signIn, {})`. signIn never redirects: once
 *      the email has gone out it returns `{ sentTo }`, and the code step
 *      replaces this one.
 *   2. CODE -- "Check your inbox", naming the address, with a field for the
 *      one-time code from the email: `useActionState(verifyCode, {})`,
 *      which redirects on success. The same email has a link that signs in
 *      without the code; why both, and the catch (they are one token), is
 *      at verifyCode() in src/app/login/actions.ts. "Use a different email"
 *      goes back to step 1 without a round trip. "Resend code" posts the
 *      same address to signIn again, after a countdown.
 *
 * The code field LOOKS like six boxes but is ONE real input laid over them:
 * paste, iOS/Android one-time-code autofill and screen readers all see a
 * normal text field. Codes may be 6-10 digits (OTP_CODE_*_LENGTH, matching
 * Supabase's setting), so the boxes grow past six if a longer code arrives.
 * What was typed is never rewritten -- the schema drops spaces and hyphens
 * and explains anything else.
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

import { useActionState, useEffect, useId, useState } from "react";

import {
  signIn,
  verifyCode,
  type SignInState,
  type VerifyCodeState,
} from "@/app/login/actions";
import Icon from "@/components/ui/Icon";
import {
  BUTTON_ON_DARK,
  FIELD,
  FIELD_ERROR_ON_DARK,
  FORM_ERROR_ON_DARK,
  INPUT_ON_DARK,
  LABEL_ON_DARK,
  LINK_ON_DARK,
} from "@/components/ui/styles";
import { OTP_CODE_MAX_LENGTH, OTP_CODE_MIN_LENGTH } from "@/lib/limits";

/**
 * Seconds before "Resend code" is offered. Hosted Supabase refuses a second
 * email to the same address within its "minimum interval" (60s by default,
 * Authentication -> Rate Limits); offering it sooner only produces a
 * rate-limit error. Change both together.
 */
export const RESEND_AFTER_SECONDS = 60;

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
  // useActionState -- no stale "that code didn't work" from the last email,
  // and a fresh resend countdown.
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
        resend={formAction}
        resending={pending}
        onChangeEmail={() => setDismissed(state)}
      />
    );
  }
  return <EmailStep state={state} formAction={formAction} pending={pending} next={next} />;
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  );
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
  const ids = {
    heading: `${prefix}-heading`,
    email: `${prefix}-email`,
    hint: `${prefix}-hint`,
    error: `${prefix}-error`,
  };
  const error = state.fieldErrors?.email?.[0];

  return (
    <section aria-labelledby={ids.heading}>
      <h1 id={ids.heading} className="text-center text-[26px] leading-tight font-bold tracking-tight">
        Sign in
      </h1>
      <p className="mt-2 mb-6 text-center text-base text-white/80">
        Use your Vanderbilt email. We&apos;ll send you a code.
      </p>
      <form action={formAction} noValidate className="flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {state.formError && (
          <p role="alert" className={FORM_ERROR_ON_DARK}>
            {state.formError}
          </p>
        )}
        <div className={FIELD}>
          <label htmlFor={ids.email} className={LABEL_ON_DARK}>
            Vanderbilt email
          </label>
          <div className="relative">
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
              readOnly={pending}
              defaultValue={state.values?.email ?? state.sentTo ?? ""}
              aria-invalid={error ? true : undefined}
              aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
              className={`${INPUT_ON_DARK} pr-12 read-only:opacity-60`}
            />
            <Icon
              name="mail"
              className="pointer-events-none absolute top-1/2 right-5 size-5 -translate-y-1/2 text-white/72"
            />
          </div>
          {error && (
            <p id={ids.error} role="alert" className={FIELD_ERROR_ON_DARK}>
              {error}
            </p>
          )}
        </div>
        <button type="submit" disabled={pending} className={`${BUTTON_ON_DARK} mt-1 w-full`}>
          {pending && <Spinner />}
          {pending ? "Sending…" : "Send code"}
        </button>
        <p id={ids.hint} className="text-center text-sm text-white/72">
          Only @vanderbilt.edu addresses can sign in. No password needed.
        </p>
      </form>
    </section>
  );
}

function CodeStep({
  email,
  next,
  resend,
  resending,
  onChangeEmail,
}: {
  email: string;
  next?: string;
  resend: (formData: FormData) => void;
  resending: boolean;
  onChangeEmail: () => void;
}) {
  const [state, formAction, pending] = useActionState<VerifyCodeState, FormData>(
    verifyCode,
    {},
  );
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  // After a refused submit, show what the server echoed back (it is what was
  // typed); a controlled input is not reset by the form action anyway.
  const [echoed, setEchoed] = useState(state);
  if (echoed !== state) {
    setEchoed(state);
    if (state.values?.code !== undefined) setCode(state.values.code);
  }
  const secondsLeft = useCountdown(RESEND_AFTER_SECONDS);

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
  const invalid = Boolean(error || formError);

  const characters = code.replace(/[\s-]/g, "");
  const boxCount = Math.min(
    OTP_CODE_MAX_LENGTH,
    Math.max(OTP_CODE_MIN_LENGTH, characters.length),
  );
  const activeBox = Math.min(characters.length, boxCount - 1);

  return (
    <section aria-labelledby={ids.heading}>
      <h1 id={ids.heading} className="text-center text-[26px] leading-tight font-bold tracking-tight">
        Check your inbox
      </h1>
      {/* role="status" so a screen reader announces the change of step. */}
      <p role="status" className="mt-2 mb-6 text-center text-base text-white/80">
        We sent a sign-in code to{" "}
        <strong className="block font-bold text-white [overflow-wrap:anywhere]">{email}</strong>
        <span className="mt-1 block text-sm text-white/72">
          Enter the code below, or open the link in the same email.
        </span>
      </p>

      <form action={formAction} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="email" value={email} />
        {next && <input type="hidden" name="next" value={next} />}
        <div className={FIELD}>
          <label htmlFor={ids.code} className="sr-only">
            Sign-in code
          </label>
          <p id={ids.hint} className="sr-only">
            The number in the email. Nothing there? Check your junk folder.
          </p>
          <div className="relative">
            <div
              aria-hidden
              className={`grid gap-2 ${invalid ? "motion-safe:animate-shake" : ""}`}
              style={{ gridTemplateColumns: `repeat(${boxCount}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: boxCount }, (_, i) => {
                const filled = i < characters.length;
                const active = focused && i === activeBox;
                return (
                  <span
                    key={i}
                    className={
                      "grid aspect-[4/5] max-h-14 place-items-center rounded-xl border text-[22px] font-bold tabular-nums transition-colors " +
                      (invalid
                        ? "border-danger-on-dark/80 bg-danger/10"
                        : active
                          ? "border-blue-300 bg-white/[0.12] ring-4 ring-blue-300/25"
                          : filled
                            ? "border-white/30 bg-white/[0.1]"
                            : "border-white/20 bg-white/[0.05]")
                    }
                  >
                    {characters[i] ?? ""}
                  </span>
                );
              })}
            </div>
            <input
              id={ids.code}
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoCapitalize="none"
              spellCheck={false}
              required
              readOnly={pending}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              aria-invalid={error ? true : undefined}
              aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(" ")}
              className="absolute inset-0 min-h-11 w-full cursor-text bg-transparent text-base text-transparent caret-transparent outline-none selection:bg-transparent focus-visible:outline-none"
            />
          </div>
          {error && (
            <p id={ids.error} role="alert" className={`${FIELD_ERROR_ON_DARK} mt-1`}>
              {error}
            </p>
          )}
        </div>
        {formError && (
          <p role="alert" className={FORM_ERROR_ON_DARK}>
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className={`${BUTTON_ON_DARK} w-full`}
        >
          {pending && <Spinner />}
          {pending ? "Checking…" : "Sign in"}
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between gap-3">
        <form action={resend}>
          <input type="hidden" name="email" value={email} />
          {next && <input type="hidden" name="next" value={next} />}
          {secondsLeft > 0 ? (
            <p className="inline-flex min-h-11 items-center text-sm text-white/72" aria-live="off">
              Resend in {formatSeconds(secondsLeft)}
            </p>
          ) : (
            <button type="submit" disabled={resending} className={LINK_ON_DARK}>
              {resending ? "Sending…" : "Resend code"}
            </button>
          )}
        </form>
        <button type="button" onClick={onChangeEmail} className={LINK_ON_DARK}>
          Use a different email
        </button>
      </div>
      <p className="mt-2 border-t border-white/10 pt-4 text-center text-sm text-white/72">
        Codes and links work once, for an hour.
      </p>
    </section>
  );
}

/** Counts down from `seconds` to 0, once, from mount. */
function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return left;
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
