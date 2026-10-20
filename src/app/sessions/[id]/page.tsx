/**
 * One study session (US-04, US-07, US-08, US-23), S6 (#52), redrawn in the
 * 2026-10-20 redesign. Cards everywhere link here.
 *
 *   main   header card with the department's wash: status and Hosting/
 *          Joined pills, course line, the topic as the title; a details card
 *          (When, Where, Host, Seats with a bar); the map with the pin and a
 *          caption; then the actions, directly under what they depend on
 *   side   Who's going, and Report a problem
 *
 *   - `requireUser()` first, like every page under /sessions. Its id marks
 *     the viewer on the roster.
 *   - `getSession()` returns null for an id that is not a session, and the
 *     page 404s. Cancelled and ended sessions still render, with a notice
 *     instead of a button.
 *   - `rosterAction()` (src/lib/roster.ts) picks the action.
 *
 * Times are formatted in campus time explicitly (src/lib/format.ts): this
 * runs in UTC on Vercel. `params` is a Promise in this version of Next.js.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SessionPlaceMap from "@/components/SessionPlaceMap";
import SessionActions, { WhosGoing } from "@/components/SessionRoster";
import { Pill } from "@/components/SessionCard";
import { PageCrumbs } from "@/components/shell/ShellContext";
import Icon, { type IconName } from "@/components/ui/Icon";
import { cardWash } from "@/lib/departments";
import { formatCampusDay, formatCourseCode } from "@/lib/format";
import { rosterAction } from "@/lib/roster";
import { avatarColour, formatTimeRange, initialsOf, sessionRelation, sessionStatus } from "@/lib/session-view";
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
  const status = sessionStatus(session, now);
  const relation = sessionRelation(session, viewer.id);
  const past = status === "ended" || status === "cancelled";
  const upcoming = !past;
  const code = formatCourseCode(session.course);
  const where = session.room ? `${session.locationLabel}, ${session.room}` : session.locationLabel;
  const when = `${formatCampusDay(new Date(session.startsAt), now)}, ${formatTimeRange(session.startsAt, session.endsAt)}`;
  const taken = session.attendeeCount;
  const hostColour = session.hostId ? avatarColour(session.hostId) : { bg: "#F1F2F4", fg: "#6B7280" };
  const hostIsViewer = session.hostId === viewer.id;

  return (
    <main className="min-w-0">
      <PageCrumbs
        trail={[{ label: "Sessions", href: "/sessions" }, { label: code, href: `/sessions?course=${encodeURIComponent(code)}` }, { label: session.topic }]}
      />

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-3">
          <header
            className="flex flex-col gap-2 rounded-xl border border-[rgba(17,24,39,0.07)] px-4 py-4 sm:px-5"
            style={{ background: past ? "#FFFFFF" : cardWash(session.course.departmentCode) }}
          >
            <div className="flex flex-wrap gap-1.5">
              <Pill kind={status} />
              {relation && <Pill kind={relation} />}
            </div>
            <p className="text-[13px] whitespace-nowrap">
              <span className="font-semibold text-ink">{code}</span>
              {session.course.title && <span className="text-ink-2"> · {session.course.title}</span>}
            </p>
            <h1
              id="session-heading"
              className={`text-[26px] leading-[1.2] font-bold tracking-[-0.02em] [text-wrap:pretty] ${past ? "text-ink-2 line-through" : "text-ink"}`}
            >
              {session.topic}
            </h1>
          </header>

          <dl className="rounded-xl border border-line bg-white px-4 sm:px-5">
            <Detail icon="clock" term="When">
              <time dateTime={session.startsAt} suppressHydrationWarning>
                {when}
              </time>
            </Detail>
            <Detail icon="pin" term="Where">
              {where}
            </Detail>
            <Detail icon="user" term="Host">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{ background: hostColour.bg, color: hostColour.fg }}
                >
                  {initialsOf(session.hostDisplayName)}
                </span>
                {hostIsViewer ? "You" : (session.hostDisplayName ?? "Deleted user")}
              </span>
            </Detail>
            <Detail icon="users" term="Seats" last>
              <span className="flex flex-col gap-1.5">
                <span className={session.seatsLeft > 0 && !past ? "text-seat" : "text-ink-2"}>
                  {session.seatsLeft > 0 ? `${session.seatsLeft} of ${session.capacity} seats left` : `All ${session.capacity} seats taken`}
                </span>
                <span aria-hidden className="block h-1 w-40 overflow-hidden rounded-full bg-column">
                  <span
                    className={`block h-full rounded-full ${session.seatsLeft > 0 && !past ? "bg-seat" : "bg-ink-3"}`}
                    style={{ width: `${Math.min(100, (taken / session.capacity) * 100)}%` }}
                  />
                </span>
              </span>
            </Detail>
          </dl>

          <SessionPlaceMap location={session.location ?? null} label={session.locationLabel} />

          <SessionActions
            sessionId={session.id}
            action={action}
            canAddToCalendar={upcoming}
            session={{
              course: session.course,
              topic: session.topic,
              startsAt: session.startsAt,
              endsAt: session.endsAt,
              locationLabel: session.locationLabel,
              room: session.room,
            }}
          />
        </div>

        <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3 lg:sticky lg:top-20">
          <WhosGoing
            capacity={session.capacity}
            attendees={session.attendees}
            viewerId={viewer.id}
            title={status === "now" ? "In the session now" : past ? "Who went" : "Who's going"}
          />
          <a
            href="https://github.com/jhdaws/study-buddy/issues/new?title=Report%3A%20a%20study%20session"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 self-start px-0.5 text-[13px] text-ink-2 hover:text-ink lg:min-h-9"
          >
            <Icon name="flag" />
            Report a problem
          </a>
        </aside>
      </div>
    </main>
  );
}

function Detail({
  icon,
  term,
  children,
  last = false,
}: {
  icon: IconName;
  term: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[20px_64px_minmax(0,1fr)] items-start gap-2 py-3 text-sm ${last ? "" : "border-b border-line"}`}>
      <span className="pt-0.5 text-ink-2">
        <Icon name={icon} />
      </span>
      <dt className="text-ink-2">{term}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}
