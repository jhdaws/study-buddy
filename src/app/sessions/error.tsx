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
    <main>
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p role="alert" className="mt-2 text-base text-neutral-600 dark:text-neutral-400">
        We couldn&apos;t load this page. Check your connection and try again.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="min-h-11 rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-5 text-base font-medium dark:border-neutral-700"
        >
          Go to the home page
        </Link>
      </div>
    </main>
  );
}
