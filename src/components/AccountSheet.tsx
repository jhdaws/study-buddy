"use client";

/**
 * The signed-in student's avatar in the top bar, opening an account sheet
 * with sign-out (Claude Design spec, page 15, "Sign-out confirmation"). On
 * phones it slides up from the bottom; from `sm` up it is a small panel
 * under the avatar.
 *
 * A hand-rolled dialog rather than <dialog>: jsdom has no showModal(), and
 * the behaviour needed is small -- focus starts on Cancel, the safe choice
 * (Enter straight after opening must not sign anyone out), Tab and
 * Shift+Tab stay inside the sheet as aria-modal promises, Escape and the
 * backdrop close it, and focus returns to the avatar. It is
 * portalled to <body>: the top bar's backdrop-filter makes it the containing
 * block for `position: fixed` descendants, which pinned the sheet to the bar
 * instead of the screen's bottom edge.
 *
 * Sign-out is still a plain form posting to the signOut Server Function, so
 * it works before JavaScript loads... except that opening the sheet needs
 * JavaScript. The desktop sidebar's sign-out button (SidebarAccount) does
 * not. No email is shown anywhere here (US-25).
 */

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { signOut } from "@/app/login/actions";
import Icon from "@/components/ui/Icon";
import { BUTTON_SECONDARY } from "@/components/ui/styles";
import { formatInitial } from "@/lib/format";

export default function AccountSheet({
  displayName,
}: {
  displayName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const avatar = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      cancel.current?.focus();
      wasOpen.current = true;
      const onKey = (event: KeyboardEvent) => {
        if (event.key === "Escape") setOpen(false);
        if (event.key === "Tab" && sheet.current) keepFocusInside(sheet.current, event);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
    if (wasOpen.current) avatar.current?.focus();
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={avatar}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Account"
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded-full bg-navy-900 text-base font-bold text-white ring-offset-2 ring-offset-sky-50 hover:ring-2 hover:ring-blue-300"
      >
        {formatInitial(displayName)}
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-navy-950/40 backdrop-blur-[2px] sm:bg-navy-950/10 sm:backdrop-blur-none"
            />
            <div
              ref={sheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="glass-dark absolute inset-x-0 bottom-0 rounded-t-hero p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-white sm:inset-x-auto sm:top-16 sm:right-4 sm:bottom-auto sm:w-80 sm:rounded-card"
            >
              <span
                aria-hidden
                className="mx-auto mb-4 block h-1 w-10 rounded-full bg-white/30 sm:hidden"
              />
              <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                <span
                  aria-hidden
                  className="grid size-11 place-items-center rounded-full bg-blue-600 text-base font-bold"
                >
                  {formatInitial(displayName)}
                </span>
                <div>
                  <p className="font-bold">{displayName ?? "Your account"}</p>
                  <p className="text-sm text-white/72">Your display name</p>
                </div>
              </div>
              <h2 id={titleId} className="mt-4 text-xl font-extrabold">
                Sign out of Study Buddy?
              </h2>
              <p className="mt-1 text-sm text-white/80">
                To sign back in, you&apos;ll need a new code from your
                Vanderbilt email.
              </p>
              <form action={signOut} className="mt-5">
                <button
                  type="submit"
                  className="inline-flex h-12 min-h-11 w-full items-center justify-center gap-2 rounded-full bg-danger px-6 text-base font-bold text-white hover:bg-danger/90"
                >
                  <Icon name="logout" />
                  Sign out
                </button>
              </form>
              <button
                ref={cancel}
                type="button"
                onClick={() => setOpen(false)}
                className={`${BUTTON_SECONDARY} mt-3 w-full`}
              >
                Cancel
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Wrap Tab and Shift+Tab around the sheet's own controls. */
function keepFocusInside(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const current = document.activeElement;
  const outside = !(current instanceof Node) || !container.contains(current);
  if (event.shiftKey && (current === first || outside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (current === last || outside)) {
    event.preventDefault();
    first.focus();
  }
}
