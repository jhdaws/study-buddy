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

import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/ui/styles";

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
    <main className="rounded-2xl border border-line bg-white px-5 py-10 text-center">
      <h1 className="text-[22px] font-bold text-ink">This page couldn&apos;t load</h1>
      <p role="alert" className="mt-1 text-[15px] text-ink-2">
        Check your connection and try again.
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button type="button" onClick={() => retry()} className={BUTTON_PRIMARY}>
          Try again
        </button>
        <Link href="/" className={BUTTON_SECONDARY}>
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
