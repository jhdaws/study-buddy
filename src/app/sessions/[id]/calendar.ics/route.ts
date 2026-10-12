// GET /sessions/[id]/calendar.ics -- download a session as a calendar event
// (US-19, docs/backlog.md). The file-building rules live in src/lib/ics.ts,
// which is pure; this handler only adapts them to HTTP.
//
// WHY A ROUTE HANDLER AND NOT A SERVER FUNCTION. The browser has to navigate
// to this to get a download, and the response is a file rather than a UI
// update. Server Functions are POSTs that return React payloads
// (node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md);
// a plain GET URL can be an <a download>, can be curl'd, and reaches
// Outlook's "add to calendar" without JavaScript.
//
// `params` is a Promise in this version of Next.js and is awaited below. It is
// typed inline rather than with the generated `RouteContext<...>` helper on
// purpose: that type comes from .next/types, which does not exist when CI runs
// `npm run typecheck` on a fresh checkout -- build, which generates it, runs
// after.
//
// Auth: requireUser(), which is still the W4 stub (#11) and lets everyone
// through. When A4 (#17) lands it redirects a signed-out caller to /login, and
// this handler inherits that with no change. That is the right shape anyway --
// a session's host and location should not be readable by a stranger who
// guesses an id. Unlike /api/courses this is a navigation, not a fetch(), so a
// redirect to the sign-in page is the correct response rather than a trap.

import type { NextRequest } from "next/server";

import { buildSessionIcs, icsFileName } from "@/lib/ics";
import { listSessions } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  await requireUser();

  const { id } = await context.params;

  // Scanning the list is the only read Track S exposes today. listSessions()
  // already drops cancelled and ended sessions, so neither can be downloaded,
  // and once S4 (#21) makes it real, RLS decides what is visible here too.
  // A getSession(id) belongs in src/lib/sessions.ts with the rest of Track S.
  const session = (await listSessions()).find((item) => item.id === id);

  if (!session) {
    return new Response("No session with that id is open.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const body = buildSessionIcs(session, {
    sessionUrl: new URL(`/sessions/${session.id}`, request.nextUrl.origin).toString(),
    now: new Date(),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(session)}"`,
      // Per-user and time-sensitive: a shared cache must not keep it, and the
      // seat counts in it go stale within minutes.
      "Cache-Control": "private, no-store",
    },
  });
}
