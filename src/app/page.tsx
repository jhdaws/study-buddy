/**
 * Home. Built by W5 (#12) as a one-screen pitch; now the home dashboard from
 * the Claude Design spec (pages 18-20), built from data the app really has.
 *
 *   Signed out: the pitch -- what Study Buddy is, three steps, sign in.
 *   Signed in, from listSessions():
 *     - the soonest open session, large (spec: "Your next session")
 *     - "Up next": a date tile and the next few sessions after it
 *     - "Happening on campus": the feed (a swipe row on phones)
 *     - "Campus right now": a ring of seats taken across every open session
 *       (spec: the "This week" ring)
 *     - a nudge to host
 *
 * Left out on purpose until a backend exists: the spec's personal stats
 * (hours studied, sessions joined/hosted, streak, classmates met, activity
 * chart), "Up next" as MY joined sessions, courses "for you" (no enrolment
 * data), study requests (US-16) and the map. Inventing those numbers would be
 * fixture data on the home page. "View" links open the session's page (S6).
 *
 * Phones read top to bottom in DOM order (ADR 0004). From lg up the same
 * cards are placed on a grid with explicit columns and rows: ring, soonest
 * session and Up next in one row; the feed as a row of cards; the nudge.
 *
 * listSessions() is still the W4 fixture stub until S4 (#21); this page does
 * not change when it lands. A failure to load it shows inline messages
 * rather than taking the page down.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import SessionCard from "@/components/SessionCard";
import Icon, { type IconName } from "@/components/ui/Icon";
import { BUTTON_PRIMARY, BUTTON_PRIMARY_LIGHT, SECTION_TITLE } from "@/components/ui/styles";
import {
  formatCampusDay,
  formatCourseCode,
  formatDateTile,
  formatSeatsLeft,
  formatSessionTime,
  formatStartTime,
  isInProgress,
} from "@/lib/format";
import { listSessions, type SessionListItem } from "@/lib/sessions";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Study Buddy" },
};

/** Cards in the feed before "See all". */
const FEED_LIMIT = 6;
/** Rows in "Up next", after the soonest session. */
const UP_NEXT_LIMIT = 3;

const HERO_BG =
  "relative overflow-hidden rounded-hero bg-gradient-to-br from-navy-600 via-navy-700 to-navy-900 text-white shadow-[0_30px_60px_-30px_rgba(10,26,54,0.8)]";

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

/** The session's own page (S6). */
function viewHref(session: SessionListItem) {
  return `/sessions/${session.id}`;
}

function Chip({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-sm font-semibold">
      <Icon name={icon} className="size-4 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
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
  const greeting = `Hey${displayName ? `, ${displayName}` : ""}`;
  const failed = sessions === null;
  const list = sessions ?? [];
  const soonest = list[0];
  const upNext = list.slice(1, 1 + UP_NEXT_LIMIT);
  const openToday = list.filter((s) => formatCampusDay(new Date(s.startsAt), now) === "Today").length;

  const summary = failed
    ? "Sessions couldn't load. Check your connection and reload."
    : list.length === 0
      ? "No sessions open on campus yet."
      : `${list.length} ${list.length === 1 ? "session" : "sessions"} open on campus${openToday ? `, ${openToday} today` : ""}.`;

  return (
    <main className="min-w-0">
      {/* Desktop page header (phones get the greeting inside the hero). */}
      <div className="mb-6 hidden items-end justify-between gap-4 lg:flex">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-navy-900">{greeting}</h1>
          <p className="mt-1 text-base text-navy-muted">{summary}</p>
        </div>
        <Link href="/sessions/new" className={BUTTON_PRIMARY_LIGHT}>
          <Icon name="plus" />
          Host a session
        </Link>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-3 lg:gap-5">
        {/* ---- Soonest session (hero) -------------------------------------- */}
        <section
          aria-labelledby="home-soonest"
          className={`${HERO_BG} p-5 sm:p-6 lg:col-start-2 lg:row-start-1`}
        >
          <div aria-hidden className="absolute -top-24 -right-16 size-64 rounded-full bg-blue-400/25 blur-3xl" />
          <h1 className="relative mb-3 text-base font-semibold text-white/85 lg:hidden">{greeting}</h1>
          {soonest ? (
            <>
              <h2 id="home-soonest" className="relative text-sm font-semibold text-white/80">
                Soonest on campus
              </h2>
              <p className="relative mt-1 text-5xl leading-none font-extrabold tracking-tight">
                {formatCourseCode(soonest.course)}
              </p>
              <p className="relative mt-2 text-base font-semibold text-white/85">{soonest.topic}</p>
              <div className="relative mt-4 flex flex-wrap gap-2">
                <Chip icon="clock">
                  <time dateTime={soonest.startsAt}>
                    {formatSessionTime(soonest.startsAt, soonest.endsAt, now)}
                  </time>
                </Chip>
                <Chip icon="pin">{soonest.locationLabel}</Chip>
                <Chip icon="seat">{formatSeatsLeft(soonest.seatsLeft)}</Chip>
              </div>
            </>
          ) : (
            <>
              <h2 id="home-soonest" className="relative text-sm font-semibold text-white/80">
                Welcome to Study Buddy
              </h2>
              <p className="relative mt-1 text-3xl leading-tight font-extrabold tracking-tight">
                {failed ? "Sessions couldn't load" : "Find your first study session"}
              </p>
            </>
          )}
          <nav aria-label="Quick actions" className="relative mt-5 grid grid-cols-2 gap-3 lg:hidden">
            <ActionTile href="/sessions" icon="search" label="Browse" />
            <ActionTile href="/sessions/new" icon="plus" label="Host" />
          </nav>
          {soonest && (
            <Link
              href={viewHref(soonest)}
              className="relative mt-5 hidden min-h-11 items-center gap-1.5 text-sm font-bold text-blue-200 underline-offset-4 hover:underline lg:inline-flex"
            >
              View session
              <Icon name="arrowRight" className="size-4" />
            </Link>
          )}
        </section>

        {/* ---- Up next ------------------------------------------------------ */}
        <section aria-labelledby="home-up-next" className="min-w-0 lg:col-start-3 lg:row-start-1 lg:flex lg:flex-col">
          <div className="mb-3 flex items-baseline justify-between gap-3 lg:hidden">
            <h2 id="home-up-next" className={SECTION_TITLE}>
              Up next
            </h2>
            <SeeAll />
          </div>
          <div className="glass-light flex gap-4 rounded-card p-4 text-navy-900 lg:flex-1">
            <div className="min-w-0 flex-1">
              <p className="mb-2 hidden text-lg font-extrabold lg:block" aria-hidden>
                Up next
              </p>
              {upNext.length === 0 ? (
                <div className="flex items-center gap-3 py-2">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-navy-900/10">
                    <Icon name="calendar" className="size-6" />
                  </span>
                  <div>
                    <p className="font-extrabold">Nothing else coming up yet</p>
                    <p className="text-sm text-navy-900/80">New sessions show up here.</p>
                  </div>
                </div>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {upNext.map((session) => (
                    <li key={session.id}>
                      <Link
                        href={viewHref(session)}
                        className="flex min-h-11 items-center gap-3 rounded-2xl px-2 py-2 hover:bg-white/40"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold whitespace-nowrap">
                            <span aria-hidden className="mr-1.5 inline-block size-2 rounded-full bg-navy-900" />
                            <time dateTime={session.startsAt}>
                              {formatCampusDay(new Date(session.startsAt), now)} ·{" "}
                              {formatStartTime(session.startsAt)}
                            </time>
                          </span>
                          <span className="block truncate font-extrabold">
                            {formatCourseCode(session.course)}
                          </span>
                          <span className="block truncate text-sm text-navy-900/80">
                            {session.locationLabel}
                          </span>
                        </span>
                        <Icon name="arrowRight" className="size-5 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DateTile date={upNext[0] ? new Date(upNext[0].startsAt) : now} />
          </div>
        </section>

        {/* ---- Feed --------------------------------------------------------- */}
        <section aria-labelledby="home-feed" className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-start-2">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="home-feed" className={SECTION_TITLE}>
              Happening on campus
            </h2>
            {list.length > 0 && <SeeAll />}
          </div>
          {failed ? (
            <p role="alert" className="glass-dark rounded-card p-5 text-base text-white">
              Couldn&apos;t load sessions. Check your connection and reload the page.
            </p>
          ) : list.length === 0 ? (
            <div className="glass-dark rounded-card p-6 text-center text-white">
              <p className="text-lg font-extrabold">No sessions yet</p>
              <p className="mt-1 text-base text-white/80">
                Start one and classmates in your course can join.
              </p>
            </div>
          ) : (
            <ul
              aria-label="Open study sessions"
              className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-5 lg:overflow-visible lg:px-0 lg:pb-0"
            >
              {list.slice(0, FEED_LIMIT).map((session) => (
                <li key={session.id} className="w-[82%] max-w-sm shrink-0 snap-start lg:w-auto lg:max-w-none">
                  <SessionCard session={session} now={now} variant="compact" />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---- Campus right now (ring) ------------------------------------- */}
        {!failed && (
          <section
            aria-labelledby="home-campus"
            className="glass-dark rounded-card p-5 text-white lg:col-start-1 lg:row-start-1"
          >
            <CampusRing sessions={list} now={now} />
          </section>
        )}

        {/* ---- Nudge to host ----------------------------------------------- */}
        <section
          aria-labelledby="home-host"
          className="glass-light flex flex-col gap-4 rounded-card p-5 sm:flex-row sm:items-center sm:justify-between lg:col-span-3 lg:col-start-1 lg:row-start-3"
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
      </div>
    </main>
  );
}

function SeeAll() {
  return (
    <Link
      href="/sessions"
      className="inline-flex min-h-11 items-center text-sm font-bold text-navy-900 underline underline-offset-4"
    >
      See all
    </Link>
  );
}

function DateTile({ date }: { date: Date }) {
  const { weekday, day, month } = formatDateTile(date);
  return (
    <div
      aria-hidden
      className="flex w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-navy-900 px-2 py-3 text-center text-white"
    >
      <span className="text-xs font-bold tracking-wide text-white/80 uppercase">{weekday.slice(0, 3)}</span>
      <span className="text-4xl leading-none font-extrabold">{day}</span>
      <span className="text-sm font-semibold text-white/80">{month}</span>
    </div>
  );
}

/**
 * Seats taken out of every seat in every open session, as the spec's ring.
 * All of it is derived from the list -- nothing stored, nothing invented.
 */
function CampusRing({ sessions, now }: { sessions: SessionListItem[]; now: Date }) {
  const capacity = sessions.reduce((sum, s) => sum + s.capacity, 0);
  const taken = sessions.reduce((sum, s) => sum + s.attendeeCount, 0);
  const open = Math.max(0, capacity - taken);
  const live = sessions.filter((s) => isInProgress(s.startsAt, s.endsAt, now)).length;
  const share = capacity === 0 ? 0 : taken / capacity;

  const r = 52;
  const circumference = 2 * Math.PI * r;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-campus" className="text-lg font-extrabold">
          Campus right now
        </h2>
        <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-bold text-white/85">
          {formatDateTile(now).weekday}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
            <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="12" />
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke="url(#sb-ring)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${circumference * share} ${circumference}`}
            />
            <defs>
              <linearGradient id="sb-ring" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#b9dbf8" />
                <stop offset="1" stopColor="#3d8be0" />
              </linearGradient>
            </defs>
          </svg>
          <p className="absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="block text-3xl leading-none font-extrabold">{taken}</span>
              <span className="text-xs font-semibold text-white/80">of {capacity} seats</span>
            </span>
          </p>
        </div>
        <dl className="flex w-full flex-col gap-2">
          <RingRow dot="bg-blue-300" label="Seats taken" value={taken} />
          <RingRow dot="bg-success" label="Seats open" value={open} />
          <RingRow dot="bg-white" label="Live now" value={live} />
        </dl>
      </div>
      <p className="mt-4 text-center text-xs text-white/72">
        Across {sessions.length} open {sessions.length === 1 ? "session" : "sessions"}.
      </p>
    </>
  );
}

function RingRow({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2">
      <dt className="flex items-center gap-2 text-sm text-white/85">
        <span aria-hidden className={`size-2.5 rounded-full ${dot}`} />
        {label}
      </dt>
      <dd className="text-lg font-extrabold">{value}</dd>
    </div>
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
      <section className={`${HERO_BG} p-6 sm:p-9 lg:p-12`}>
        <div aria-hidden className="absolute -top-24 -right-16 size-72 rounded-full bg-blue-400/25 blur-3xl" />
        <p className="relative text-sm font-bold tracking-wide text-blue-200 uppercase">
          For Vanderbilt students
        </p>
        <h1 className="relative mt-2 max-w-2xl text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
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
