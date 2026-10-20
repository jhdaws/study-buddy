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

import SessionRoster from "@/components/SessionRoster";
import Icon from "@/components/ui/Icon";
import { LINK, PAGE_TITLE, PANEL } from "@/components/ui/styles";
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
      <Link href="/sessions" className={`${LINK} mb-2`}>
        All sessions
      </Link>

      <article aria-labelledby="session-heading" className={`${PANEL} px-4 py-5 sm:px-6`}>
        {live && (
          <p className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-signal">
            <span aria-hidden className="size-2 rounded-full bg-signal" />
            Happening now
          </p>
        )}
        <h1 id="session-heading">
          <span className="block text-[15px] leading-snug">
            <span className="font-bold text-ink">{formatCourseCode(session.course)}</span>
            {session.course.title && (
              <span className="font-medium text-ink-2"> {session.course.title}</span>
            )}
          </span>
          <span className={`mt-1 block ${PAGE_TITLE}`}>{session.topic}</span>
        </h1>

        <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-[15px] sm:grid-cols-3">
          <div>
            <dt className="text-sm text-ink-2">When</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              <time dateTime={session.startsAt}>
                {formatSessionTime(session.startsAt, session.endsAt, now)}
              </time>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Where</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {session.locationLabel}
              {session.room && <>, {session.room}</>}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Host</dt>
            <dd className="mt-0.5 font-semibold text-ink">
              {session.hostDisplayName ?? "Deleted user"}
            </dd>
          </div>
        </dl>

        {upcoming && (
          <a href={`/sessions/${session.id}/calendar.ics`} download className={`${LINK} mt-2 gap-1.5`}>
            <Icon name="calendar" className="size-[18px]" />
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
