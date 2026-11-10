/**
 * Edit a study session, as its host (US-09). S7.
 *
 *   - `requireUser()` first, like every page under /sessions.
 *   - `getSession()` returns null for an id that is not a session: 404.
 *   - **Only the host may edit.** This page checks it so a student who
 *     follows a guessed URL gets a 404 rather than a form that will refuse
 *     them, but the check that matters is in the database: update_session()
 *     compares auth.uid() against the stored host_id, and there is no UPDATE
 *     policy on `sessions` for anything to go around it. Rendering is not
 *     authorisation.
 *   - A cancelled or ended session cannot be edited (update_session() refuses
 *     both), so the page says so instead of showing a form that cannot save.
 *   - <CreateSessionForm> does the rest, prefilled with the session's current
 *     values and pointed at editSession() -- the same form, because an edit
 *     must leave the session in a state the host could have created.
 *
 * `params` is a Promise in this version of Next.js, typed inline for the
 * reason given in ../calendar.ics/route.ts.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { editSession } from "@/app/sessions/actions";
import CreateSessionForm from "@/components/CreateSessionForm";
import { LINK, PAGE_LEAD, PAGE_TITLE, PANEL } from "@/components/ui/styles";
import { getSession, listDepartments } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Edit session",
};

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;

  const session = await getSession(id);
  if (!session) notFound();

  // Not the host: the same 404 a made-up id gets. Telling a stranger "this
  // exists but is not yours" is more than the page needs to say, and the
  // session itself is readable at /sessions/[id] anyway.
  if (session.hostId !== viewer.id) notFound();

  const ended = new Date(session.endsAt) <= new Date();
  if (session.status === "cancelled" || ended) {
    return (
      <main className="min-w-0 lg:max-w-3xl">
        <Link href={`/sessions/${session.id}`} className={`${LINK} mb-2`}>
          Back to the session
        </Link>
        <div className={`${PANEL} px-4 py-5 sm:px-6`}>
          <h1 className={PAGE_TITLE}>
            {session.status === "cancelled"
              ? "This session is cancelled"
              : "This session has ended"}
          </h1>
          <p className={`${PAGE_LEAD} mt-2`}>
            {session.status === "cancelled"
              ? "A cancelled session can't be edited. Host a new one instead."
              : "A session that has finished can't be edited. Host a new one instead."}
          </p>
          <Link href="/sessions/new" className={`${LINK} mt-4`}>
            Host a session
          </Link>
        </div>
      </main>
    );
  }

  const departments = await listDepartments();

  return (
    <main className="min-w-0">
      <Link href={`/sessions/${session.id}`} className={`${LINK} mb-2`}>
        Back to the session
      </Link>
      <h1 className={PAGE_TITLE}>Edit your session</h1>
      <p className={`${PAGE_LEAD} mb-6`}>
        Everyone on the roster sees the change straight away. Lowering the
        seats below the students already coming isn&apos;t possible — nobody is
        removed by an edit.
      </p>

      <CreateSessionForm
        departments={departments}
        action={editSession.bind(null, session.id)}
        submitLabel="Save changes"
        pendingLabel="Saving…"
        // The form's field names are the schema's keys, and every field reads
        // its initial value from here. The times are ISO with an offset, the
        // shape the hidden inputs carry (isoToLocalInput turns them back into
        // the visible datetime-local values).
        initialState={{
          values: {
            departmentCode: session.course.departmentCode,
            courseNumber: session.course.number,
            topic: session.topic,
            room: session.room ?? "",
            placeId: session.placeId,
            locationLabel: session.locationLabel,
            startsAt: session.startsAt,
            endsAt: session.endsAt,
            capacity: String(session.capacity),
          },
        }}
      />
    </main>
  );
}
