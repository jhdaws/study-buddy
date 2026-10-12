"use client";

/**
 * What /sessions and /sessions/new show when rendering throws -- say
 * listSessions() or listDepartments() cannot reach the database -- instead of
 * a blank screen. Built by W5 (#12).
 *
 * `error.message` is deliberately not shown: in production Next replaces a
 * Server Component's message with a generic one anyway, and in development it
 * could be raw Postgres text (never shown to students -- CLAUDE.md). The
 * digest is logged so it can be matched to the server log.
 *
 * `retry` re-fetches and re-renders the segment (Next 16). Its sibling
 * `reset` only clears the error without re-fetching, which would not help
 * when the data load is what failed.
 */

import Link from "next/link";
import { useEffect } from "react";

import Icon from "@/components/ui/Icon";
import { BUTTON_PRIMARY, LINK_ON_DARK } from "@/components/ui/styles";

export default function SessionsError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="glass-dark flex flex-col items-center rounded-card px-5 py-10 text-center text-white">
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full border border-danger-on-dark/40 bg-danger/20 text-danger-on-dark"
      >
        <Icon name="alert" className="size-7" />
      </span>
      <h1 className="mt-4 text-2xl font-extrabold">Couldn&apos;t load this page</h1>
      <p role="alert" className="mt-2 text-base text-white/80">
        Check your connection and try again.
      </p>
      <button type="button" onClick={() => retry()} className={`${BUTTON_PRIMARY} mt-6`}>
        <Icon name="refresh" />
        Try again
      </button>
      <Link href="/" className={`${LINK_ON_DARK} mt-2`}>
        Go to the home page
      </Link>
    </main>
  );
}
