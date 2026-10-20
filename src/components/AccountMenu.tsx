"use client";

/**
 * The account control (2026-10-20 redesign): the student's initial and name
 * at the foot of the sidebar on desktop, or just the initial at the top right
 * on a phone. It opens a small menu with their name, email, what they are
 * hosting and have joined, and Sign out (US-21, a form posting to signOut).
 *
 * Signed out, it is a "Sign in" link. Display only -- pages check access.
 */

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { signOut } from "@/app/login/actions";
import Icon from "@/components/ui/Icon";
import { formatInitial } from "@/lib/format";

export type AccountMenuProps =
  | { signedIn: false; placement: "sidebar" | "topbar" }
  | {
      signedIn: true;
      placement: "sidebar" | "topbar";
      displayName: string | null;
      email: string | null;
      hosting: number;
      joined: number;
      courses: number;
    };

export default function AccountMenu(props: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Click outside or Escape closes it.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!props.signedIn) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 min-h-11 items-center justify-center rounded-lg bg-accent px-3.5 text-sm font-medium text-white hover:bg-accent-hover lg:min-h-9"
      >
        Sign in
      </Link>
    );
  }

  const name = props.displayName ?? "Signed in";
  const initial = formatInitial(props.displayName);
  const sidebar = props.placement === "sidebar";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={
          sidebar
            ? `flex h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-column ${open ? "bg-column" : ""}`
            : "flex size-11 items-center justify-center rounded-lg"
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-dark text-xs font-semibold text-white">
          {initial}
        </span>
        {sidebar && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{name}</span>
            <span className="text-ink-2">
              <Icon name="chevUpDown" />
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className={`absolute z-50 w-[280px] rounded-xl border border-line bg-white p-1 shadow-[0_12px_32px_rgba(17,24,39,0.10)] ${
            sidebar ? "bottom-[52px] left-0 w-[264px]" : "top-12 right-0"
          }`}
        >
          <div className="flex items-center gap-2.5 p-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-dark text-sm font-semibold text-white">
              {initial}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-ink">{name}</span>
              {props.email && <span className="truncate text-xs text-ink-2">{props.email}</span>}
            </span>
          </div>
          <div className="mx-1.5 mb-1.5 flex gap-3.5 rounded-lg bg-page px-2.5 py-2 text-xs text-ink-2">
            <span>
              <span className="font-semibold text-ink">{props.hosting}</span> hosting
            </span>
            <span>
              <span className="font-semibold text-ink">{props.joined}</span> joined
            </span>
            <span>
              <span className="font-semibold text-ink">{props.courses}</span> courses
            </span>
          </div>
          <div className="my-1 h-px bg-line" />
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-ink hover:bg-column lg:h-9"
            >
              <span className="text-ink-2">
                <Icon name="logout" />
              </span>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
