/**
 * Home (2026-10-20 redesign).
 *
 *   Signed in:
 *     - a time-aware greeting and one line of status
 *     - Your sessions: up to three upcoming sessions the student hosts or has
 *       joined (relation pill first)
 *     - Next on campus: the next five open sessions, under day headings
 *     - See all sessions
 *     With nothing on campus at all, an empty state that offers hosting.
 *   Signed out: what Study Buddy is, and sign in.
 *
 * Data: listSessions() and listMySessions() (src/lib/sessions.ts). A failure
 * to load shows an inline message rather than taking the page down.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import SessionCard from "@/components/SessionCard";
import { TableIllustration } from "@/components/SessionBrowser";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";
import PageHeader from "@/components/ui/PageHeader";
import { BUTTON_PRIMARY, LINK, SECTION_TITLE } from "@/components/ui/styles";
import { CAMPUS_TIME_ZONE } from "@/lib/env";
import { campusDayOffset, isInProgress } from "@/lib/format";
import { groupByDay } from "@/lib/session-filters";
import { listMySessions, listSessions, type MySession, type SessionListItem } from "@/lib/sessions";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Study Buddy" },
};

/** Sessions under Next on campus. */
const NEXT_LIMIT = 5;
/** Cards under Your sessions. */
const MINE_LIMIT = 3;

export default async function HomePage() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <SignedOutHome />;

  const [displayName, sessions, mine] = await Promise.all([
    fetchDisplayName(supabase, user.id).catch(() => null),
    listSessions().catch(() => null),
    listMySessions(user.id).catch(() => [] as MySession[]),
  ]);

  return (
    <SignedInHome
      viewerId={user.id}
      displayName={displayName}
      sessions={sessions}
      mine={mine}
      now={new Date()}
    />
  );
}

/** "Good morning" before noon, "Good afternoon" before 5 PM, then "Good evening" -- campus time. */
function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CAMPUS_TIME_ZONE, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "8 sessions open on campus, 1 happening now." */
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
  viewerId,
  displayName,
  sessions,
  mine,
  now,
}: {
  viewerId: string;
  displayName: string | null;
  sessions: SessionListItem[] | null;
  mine: MySession[];
  now: Date;
}) {
  const list = sessions ?? [];
  const upcomingMine = mine
    .filter((s) => s.status === "open" && Date.parse(s.endsAt) > now.getTime())
    .slice(0, MINE_LIMIT);
  const next = groupByDay(list.slice(0, NEXT_LIMIT), now);
  const firstName = displayName?.split(/\s+/)[0];

  return (
    <main className="min-w-0">
      <PageHeader
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
        lead={
          sessions === null
            ? "Sessions couldn't load. Check your connection and reload the page."
            : statusLine(list, now)
        }
      />

      {sessions !== null && list.length === 0 && upcomingMine.length === 0 ? (
        <section
          aria-labelledby="home-empty"
          className="mt-8 flex flex-col items-center gap-5 rounded-2xl border border-[rgba(17,24,39,0.06)] bg-white bg-cover bg-center px-6 py-20 text-center"
          style={{ backgroundImage: "url(/bg/bg-blue-wide.webp)" }}
        >
          <TableIllustration />
          <h2 id="home-empty" className={SECTION_TITLE}>
            Nobody is studying yet
          </h2>
          <Link href="/sessions/new" className={BUTTON_PRIMARY}>
            Host the first session
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-7">
          {upcomingMine.length > 0 && (
            <section aria-labelledby="home-mine">
              <div className="mb-2.5 flex items-center justify-between">
                <h2 id="home-mine" className={SECTION_TITLE}>
                  Your sessions
                </h2>
                <Link href="/my" className="text-[13px] font-medium text-accent hover:underline">
                  See all
                </Link>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {upcomingMine.map((session) => (
                  <li key={session.id} className="min-w-0">
                    <SessionCard session={session} now={now} viewerId={viewerId} showDay relationFirst />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {list.length > 0 && (
            <section aria-labelledby="home-next" className="max-w-[720px]">
              <h2 id="home-next" className={`${SECTION_TITLE} mb-2.5`}>
                Next on campus
              </h2>
              <div className="flex flex-col gap-4">
                {next.map((group) => (
                  <div key={group.label}>
                    <p className="glass mb-2 inline-block rounded-lg px-2.5 py-1 text-xs font-semibold text-[#374151]">
                      {group.label}
                    </p>
                    <ul className="flex flex-col gap-3">
                      {group.sessions.map((session) => (
                        <li key={session.id}>
                          <SessionCard session={session} now={now} viewerId={viewerId} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Link href="/sessions" className={`${LINK} mt-3 gap-1.5`}>
                See all sessions
                <Icon name="chevRight" />
              </Link>
            </section>
          )}
        </div>
      )}
    </main>
  );
}

function SignedOutHome() {
  return (
    <main className="min-w-0">
      <section className="glass rounded-2xl border border-[rgba(17,24,39,0.06)] px-6 py-12 sm:px-10 sm:py-16">
        <Logo />
        <h1 className="mt-6 max-w-xl text-[34px] leading-[1.1] font-bold tracking-[-0.02em] text-ink sm:text-[44px]">
          Find people studying your course, tonight.
        </h1>
        <p className="mt-4 max-w-md text-[15px] text-ink-body">
          Join a study session on campus, or start one and let classmates find you. For Vanderbilt students.
        </p>
        <Link href="/login" className={`${BUTTON_PRIMARY} mt-8`}>
          Sign in with your Vanderbilt email
        </Link>
      </section>
    </main>
  );
}
