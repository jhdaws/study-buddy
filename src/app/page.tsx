/**
 * Home. Built by W5 (#12); redrawn in the 2026-10-11 calm pass around the
 * same timetable rows as /sessions, so the two pages read as one app.
 *
 *   Signed out: what Study Buddy is, how it works, sign in.
 *   Signed in, from listSessions():
 *     - a greeting and one line of status
 *     - "Next up": the soonest open session
 *     - the next few after it, under day headings, and a link to the rest
 *     - a one-line nudge to host
 *
 * Left out on purpose until a backend exists: personal stats, "my" joined
 * sessions, courses "for you" (no enrolment data), study requests (US-16),
 * the map.
 *
 * listSessions() is still the W4 fixture stub until S4 (#21); this page does
 * not change when it lands. A failure to load it shows an inline message
 * rather than taking the page down.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import SessionCard from "@/components/SessionCard";
import {
  BUTTON_ON_DARK,
  BUTTON_PRIMARY,
  LINK,
  PAGE_LEAD,
  PAGE_TITLE,
  PANEL,
  SECTION_TITLE,
} from "@/components/ui/styles";
import { campusDayOffset, isInProgress } from "@/lib/format";
import { groupByDay } from "@/lib/session-filters";
import { listSessions, type SessionListItem } from "@/lib/sessions";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Study Buddy" },
};

/** Sessions listed after "Next up" before "See all sessions". */
const LATER_LIMIT = 5;

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

/** "4 sessions open on campus, 2 of them today." -- one plain line. */
function statusLine(sessions: SessionListItem[], now: Date): string {
  if (sessions.length === 0) return "No sessions are open on campus right now.";
  const live = sessions.filter((s) => isInProgress(s.startsAt, s.endsAt, now)).length;
  const today = sessions.filter((s) => campusDayOffset(new Date(s.startsAt), now) <= 0).length;
  const total = `${sessions.length} ${sessions.length === 1 ? "session" : "sessions"} open on campus`;
  if (live > 0) return `${total}, ${live} happening now.`;
  if (today > 0) return `${total}, ${today} of them today.`;
  return `${total}.`;
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
  const list = sessions ?? [];
  const [next, ...rest] = list;
  const later = groupByDay(rest.slice(0, LATER_LIMIT), now);

  return (
    <main className="min-w-0">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className={PAGE_TITLE}>Hey{displayName ? `, ${displayName}` : ""}</h1>
          <p className={PAGE_LEAD}>
            {sessions === null
              ? "Sessions couldn't load. Check your connection and reload the page."
              : statusLine(list, now)}
          </p>
        </div>
        {/* Phones have the tab bar's Host button. */}
        <div className="hidden shrink-0 md:block">
          <Link href="/sessions/new" className={BUTTON_PRIMARY}>
            Host a session
          </Link>
        </div>
      </div>

      {sessions === null ? null : !next ? (
        <section aria-labelledby="home-empty" className={`${PANEL} px-5 py-8 text-center`}>
          <h2 id="home-empty" className={SECTION_TITLE}>
            Nobody is studying yet
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-2">
            Start a session and classmates taking the same course can find you.
          </p>
          <Link href="/sessions/new" className={`${BUTTON_PRIMARY} mt-5`}>
            Host a session
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-labelledby="home-next">
            <h2 id="home-next" className={`${SECTION_TITLE} mb-2`}>
              Next up
            </h2>
            <div className={PANEL}>
              <SessionCard session={next} now={now} showDay headingLevel="h3" />
            </div>
          </section>

          {later.map((group) => (
            <section key={group.label} aria-label={`Later, ${group.label}`}>
              <h2 className={`${SECTION_TITLE} mb-2`}>{group.label}</h2>
              <ul className={`${PANEL} divide-y divide-line`}>
                {group.sessions.map((session) => (
                  <li key={session.id}>
                    <SessionCard session={session} now={now} headingLevel="h3" />
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-4">
            {list.length > 1 + LATER_LIMIT ? (
              <Link href="/sessions" className={LINK}>
                See all {list.length} sessions
              </Link>
            ) : (
              <Link href="/sessions" className={LINK}>
                Search and filter sessions
              </Link>
            )}
            <p className="text-[15px] text-ink-2">
              Not seeing your course?{" "}
              <Link href="/sessions/new" className="font-semibold text-signal hover:underline">
                Host a session
              </Link>
            </p>
          </div>
        </div>
      )}
    </main>
  );
}

const STEPS = [
  {
    title: "See who's studying",
    body: "Sessions on campus, listed by start time, with the course, the place and the seats left.",
  },
  {
    title: "Pick one and go",
    body: "Every session says where it is and who's hosting, so you know before you walk over.",
  },
  {
    title: "Or start your own",
    body: "Choose a course, a place on campus and a time. Classmates in that course will see it.",
  },
];

function SignedOutHome() {
  return (
    <main className="min-w-0">
      <section className="rounded-2xl bg-brand px-6 py-10 text-white sm:px-10 sm:py-14">
        <p className="text-sm font-semibold text-blue-200">For Vanderbilt students</p>
        <h1 className="mt-2 max-w-xl text-[34px] leading-[1.1] font-bold tracking-tight sm:text-[44px]">
          Find people studying your course, tonight.
        </h1>
        <p className="mt-4 max-w-md text-[17px] text-white/85">
          Join a study session on campus, or start one and let classmates find you.
        </p>
        <Link href="/login" className={`${BUTTON_ON_DARK} mt-8`}>
          Sign in with your Vanderbilt email
        </Link>
      </section>

      <section aria-labelledby="how-it-works" className="mt-10">
        <h2 id="how-it-works" className={SECTION_TITLE}>
          How it works
        </h2>
        <ol className="mt-4 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="border-t-2 border-brand pt-3">
              <p className="text-sm font-semibold text-ink-2">Step {i + 1}</p>
              <h3 className="mt-1 text-[17px] font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-[15px] text-ink-2">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
