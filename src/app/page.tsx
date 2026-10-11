/**
 * Home. Built by W5 (#12) as a one-screen pitch; now the home dashboard from
 * the Claude Design spec (pages 18-20), cut down to what the app can
 * actually show today.
 *
 *   Signed out: the pitch -- what Study Buddy is, three steps, sign in.
 *   Signed in:  a greeting, how many sessions are open on campus and the
 *               soonest one, quick actions, the "Happening on campus" feed
 *               (listSessions()), and a nudge to host.
 *
 * Left out on purpose, until a backend exists for them: the spec's weekly
 * rings (hours studied, sessions joined/hosted), study streak, classmates
 * met, the activity chart, "Up next" (needs "sessions I joined"), courses
 * "for you" (no enrolment data) and study requests (US-16). Showing invented
 * numbers there would be fixture data on the home page.
 *
 * listSessions() is still the W4 fixture stub until S4 (#21); this page does
 * not change when it lands. A failure to load it shows an inline retry card
 * rather than taking the page down.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import SessionCard from "@/components/SessionCard";
import Icon, { type IconName } from "@/components/ui/Icon";
import {
  BUTTON_PRIMARY,
  BUTTON_PRIMARY_LIGHT,
  SECTION_TITLE,
} from "@/components/ui/styles";
import { formatCourseCode, formatSessionTime } from "@/lib/format";
import { listSessions, type SessionListItem } from "@/lib/sessions";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Study Buddy" },
};

/** How many sessions the home feed shows before "See all". */
const FEED_LIMIT = 6;

export default async function HomePage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SignedOutHome />;
  }

  const [displayName, sessions] = await Promise.all([
    fetchDisplayName(supabase, user.id).catch(() => null),
    listSessions().catch(() => null),
  ]);

  return <SignedInHome displayName={displayName} sessions={sessions} now={new Date()} />;
}

function ActionTile({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-tile border border-white/15 bg-white/[0.08] text-sm font-bold text-white transition-colors hover:bg-white/[0.14]"
    >
      <Icon name={icon} className="size-6" />
      {label}
    </Link>
  );
}

function SignedInHome({
  displayName,
  sessions,
  now,
}: {
  displayName: string | null;
  sessions: SessionListItem[] | null;
  now: Date;
}) {
  const soonest = sessions?.[0];
  const count = sessions?.length ?? 0;

  return (
    <main className="flex min-w-0 flex-col gap-8">
      {/* Hero */}
      <section
        aria-labelledby="home-greeting"
        className="relative overflow-hidden rounded-hero bg-gradient-to-br from-navy-600 via-navy-700 to-navy-900 p-5 text-white shadow-[0_30px_60px_-30px_rgba(10,26,54,0.8)] sm:p-7"
      >
        <div aria-hidden className="absolute -top-24 -right-16 size-64 rounded-full bg-blue-300/25 blur-3xl" />
        <h1 id="home-greeting" className="relative text-base font-semibold text-white/85">
          Hey{displayName ? `, ${displayName}` : ""}
        </h1>
        {sessions === null ? (
          <p className="relative mt-2 text-2xl font-extrabold">Sessions couldn&apos;t load</p>
        ) : (
          <p className="relative mt-1 text-5xl leading-none font-extrabold tracking-tight">
            {count}
            <span className="text-white/60"> {count === 1 ? "session" : "sessions"}</span>
          </p>
        )}
        <p className="relative mt-2 text-base text-white/85">
          {sessions === null
            ? "Check your connection, then reload the page."
            : count === 0
              ? "Nothing open on campus right now. Be the first to host."
              : "open on campus right now and coming up."}
        </p>
        {soonest && (
          <div className="relative mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
              <Icon name="sparkle" className="size-4" />
              Soonest: {formatCourseCode(soonest.course)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
              <Icon name="clock" className="size-4" />
              <time dateTime={soonest.startsAt}>
                {formatSessionTime(soonest.startsAt, soonest.endsAt, now)}
              </time>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5">
              <Icon name="pin" className="size-4" />
              {soonest.locationLabel}
            </span>
          </div>
        )}
        <nav aria-label="Quick actions" className="relative mt-5 grid grid-cols-2 gap-3">
          <ActionTile href="/sessions" icon="search" label="Browse sessions" />
          <ActionTile href="/sessions/new" icon="plus" label="Host a session" />
        </nav>
      </section>

      {/* Feed */}
      <section aria-labelledby="home-feed" className="min-w-0">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="home-feed" className={SECTION_TITLE}>
            Happening on campus
          </h2>
          {count > 0 && (
            <Link
              href="/sessions"
              className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-navy-900 underline underline-offset-4"
            >
              See all
            </Link>
          )}
        </div>
        {sessions === null ? (
          <p role="alert" className="glass-dark rounded-card p-5 text-base text-white">
            Couldn&apos;t load sessions. Check your connection and reload the page.
          </p>
        ) : count === 0 ? (
          <div className="glass-dark rounded-card p-6 text-center text-white">
            <p className="text-lg font-extrabold">No sessions yet</p>
            <p className="mt-1 text-base text-white/80">
              Start one and classmates in your course can join.
            </p>
          </div>
        ) : (
          <ul
            aria-label="Upcoming study sessions"
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0"
          >
            {sessions.slice(0, FEED_LIMIT).map((session) => (
              <li key={session.id} className="w-[82%] shrink-0 snap-start md:w-auto">
                <SessionCard session={session} now={now} variant="compact" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Nudge to host */}
      <section
        aria-labelledby="home-host"
        className="glass-light flex flex-col gap-4 rounded-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
      >
        <div>
          <h2 id="home-host" className="text-xl font-extrabold tracking-tight text-navy-900">
            Can&apos;t find a session for your course?
          </h2>
          <p className="mt-1 text-base text-navy-900/80">
            Host one. Classmates taking the same course will see it in the list.
          </p>
        </div>
        <Link href="/sessions/new" className={`${BUTTON_PRIMARY_LIGHT} shrink-0`}>
          <Icon name="plus" />
          Host a session
        </Link>
      </section>
    </main>
  );
}

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "search",
    title: "Find a session",
    body: "See who's studying what, where and when, across campus.",
  },
  {
    icon: "seat",
    title: "Grab a seat",
    body: "Every session shows how many seats are left before you walk over.",
  },
  {
    icon: "plus",
    title: "Or host your own",
    body: "Pick a course, a place and a time. Classmates find you.",
  },
];

function SignedOutHome() {
  return (
    <main className="flex min-w-0 flex-col gap-8">
      <section className="relative overflow-hidden rounded-hero bg-gradient-to-br from-navy-600 via-navy-700 to-navy-900 p-6 text-white shadow-[0_30px_60px_-30px_rgba(10,26,54,0.8)] sm:p-9">
        <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-blue-300/25 blur-3xl" />
        <p className="relative text-sm font-bold tracking-wide text-blue-200 uppercase">
          For Vanderbilt students
        </p>
        <h1 className="relative mt-2 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
          Find your study group, right now.
        </h1>
        <p className="relative mt-4 max-w-md text-lg text-white/85">
          Join a session on campus, or start one and let classmates in your course find you.
        </p>
        <div className="relative mt-7 flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className={BUTTON_PRIMARY}>
            Sign in to get started
            <Icon name="arrowRight" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className={`${SECTION_TITLE} mb-3`}>
          How it works
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="glass-dark rounded-card p-5 text-white">
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-full bg-white/[0.1] text-blue-200"
                >
                  <Icon name={step.icon} className="size-5" />
                </span>
                <span className="text-sm font-bold text-white/72">Step {i + 1}</span>
              </span>
              <h3 className="mt-3 text-lg font-extrabold">{step.title}</h3>
              <p className="mt-1 text-base text-white/80">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
