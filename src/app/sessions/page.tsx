/**
 * Sessions (US-03), from the 2026-10-20 redesign: the page header with Host a
 * session, then <SessionBrowser> (List, Board, Calendar; search, filter pills
 * and the Filter popover).
 *
 * `listSessions()` (src/lib/sessions.ts) returns open sessions that have not
 * ended, soonest first. If it throws, ./error.tsx shows a retry screen.
 * `?q=`, `?course=` and `?view=` set the browser's starting state: the top
 * bar's search and the sidebar's Courses link here with them.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import SessionBrowser, { type SessionView } from "@/components/SessionBrowser";
import PageHeader from "@/components/ui/PageHeader";
import { listSessions } from "@/lib/sessions";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sessions",
};

const VIEWS = new Set<SessionView>(["list", "board", "calendar"]);

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Per request: which sessions have ended depends on the clock, and the
  // query reads the signed-in student's cookies.
  await connection();
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value.slice(0, 100) : "";
  };
  const view = one("view") as SessionView;

  const [sessions, user] = await Promise.all([listSessions(), getCurrentUser()]);

  return (
    <main className="min-w-0">
      <PageHeader title="Sessions" action={{ href: "/sessions/new", label: "Host a session" }} />
      <SessionBrowser
        sessions={sessions}
        now={new Date()}
        viewerId={user?.id ?? null}
        initialQuery={one("q")}
        initialCourse={one("course")}
        initialView={VIEWS.has(view) ? view : "list"}
      />
    </main>
  );
}
