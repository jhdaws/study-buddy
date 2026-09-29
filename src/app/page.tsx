/**
 * Landing page (public). Built by W5 (#12): a one-screen pitch pointing at
 * the two things the app does.
 *
 * Later: marketing copy, and branching on whether the visitor is signed in
 * once auth lands (A3/A4) -- a signed-in student probably wants /sessions
 * straight away.
 */

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="pt-6">
      <h1 className="text-3xl font-bold tracking-tight">Study Buddy</h1>
      <p className="mt-3 text-lg text-neutral-700 dark:text-neutral-300">
        Find a study group on campus right now &mdash; or start one and let
        classmates in your course find you.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        <Link
          href="/sessions"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-neutral-900 px-5 text-base font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Browse study sessions
        </Link>
        <Link
          href="/sessions/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-5 text-base font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Host a session
        </Link>
      </div>
    </main>
  );
}
