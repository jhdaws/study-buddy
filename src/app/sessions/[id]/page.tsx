/**
 * One study session: when, where, who hosts it, who is going, and Join or
 * Leave (US-04, US-07, US-08, US-23). S6 (#52). Cards in the list and on the
 * home page link here.
 *
 *   - `requireUser()` first, like every page under /sessions: the proxy
 *     already sends signed-out visitors to /login, and this is the check that
 *     does not depend on it. Its id marks the viewer on the roster.
 *   - `getSession()` (src/lib/sessions.ts) returns null for an id that is not
 *     a session, and the page 404s. Cancelled and ended sessions still render,
 *     with a notice instead of a button: a student holding a link to one
 *     should be told what happened.
 *   - `rosterAction()` (src/lib/roster.ts) picks the button; <SessionRoster>
 *     renders it and runs S5's join/leave actions.
 *
 * Times are formatted in campus time explicitly (src/lib/format.ts): this
 * runs in UTC on Vercel.
 *
 * Chat (US-05) goes below the roster in a later sprint.
 *
 * `params` is a Promise in this version of Next.js. It is typed inline rather
 * than with the generated `PageProps<...>` helper for the reason given in
 * ./calendar.ics/route.ts: CI typechecks before .next/types exists.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LivePill } from "@/components/SessionCard";
import SessionRoster from "@/components/SessionRoster";
import Icon from "@/components/ui/Icon";
import { CARD_DARK, LINK_ON_DARK } from "@/components/ui/styles";
import { formatCourseCode, formatSessionTime, isInProgress } from "@/lib/format";
import { rosterAction } from "@/lib/roster";
import { getSession } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Study session",
};

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  const now = new Date();
  const action = rosterAction(session, viewer.id, now);
  const live = action !== "cancelled" && isInProgress(session.startsAt, session.endsAt, now);
  // The calendar route only serves sessions still in the list, so offer it
  // only for those.
  const upcoming = action !== "cancelled" && action !== "ended";

  return (
    <main className="min-w-0 lg:max-w-3xl">
      <Link
        href="/sessions"
        className="mb-3 inline-flex min-h-11 items-center text-sm font-bold text-navy-900 underline-offset-4 hover:underline"
      >
        All sessions
      </Link>

      <article
        aria-labelledby="session-heading"
        className={`${CARD_DARK} p-4 sm:p-6 ${upcoming ? "" : "opacity-80"}`}
      >
        {live && (
          <div className="mb-2">
            <LivePill />
          </div>
        )}
        <h1 id="session-heading">
          <span className="block text-base leading-snug">
            <span className="font-extrabold">{formatCourseCode(session.course)}</span>
            {session.course.title && (
              <span className="font-medium text-white/72"> · {session.course.title}</span>
            )}
          </span>
          <span className="mt-2 block text-2xl leading-snug font-extrabold tracking-tight">
            {session.topic}
          </span>
        </h1>

        <dl className="mt-4 grid gap-3 rounded-inner border border-white/10 bg-white/[0.06] p-3.5 text-sm sm:grid-cols-[1fr_1.4fr_auto] sm:gap-4">
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">When</dt>
            <dd className="mt-0.5 font-semibold">
              <time dateTime={session.startsAt}>
                {formatSessionTime(session.startsAt, session.endsAt, now)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Where</dt>
            <dd className="mt-0.5 font-semibold">
              {session.locationLabel}
              {session.room && <> · {session.room}</>}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold tracking-wide text-white/72 uppercase">Host</dt>
            <dd className="mt-0.5 font-semibold">{session.hostDisplayName ?? "Deleted user"}</dd>
          </div>
        </dl>

        {upcoming && (
          <a href={`/sessions/${session.id}/calendar.ics`} download className={`${LINK_ON_DARK} mt-2 gap-1.5`}>
            <Icon name="calendar" className="size-4" />
            Add to calendar
          </a>
        )}
      </article>

      <div className="mt-4">
        <SessionRoster
          sessionId={session.id}
          capacity={session.capacity}
          seatsLeft={session.seatsLeft}
          attendees={session.attendees}
          viewerId={viewer.id}
          action={action}
        />
      </div>
    </main>
  );
}
