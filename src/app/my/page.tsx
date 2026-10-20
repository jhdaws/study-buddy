/**
 * My sessions (2026-10-20 redesign): the sessions the student hosts or has
 * joined. Two tabs: Upcoming (soonest first) and Past (most recent first,
 * ended or cancelled, greyed with the date instead of a time).
 *
 * requireUser() first, like every private page. listMySessions() reads
 * through the student's own client, so RLS applies.
 */

import type { Metadata } from "next";
import { connection } from "next/server";

import MySessionsTabs from "@/components/MySessionsTabs";
import PageHeader from "@/components/ui/PageHeader";
import { listMySessions } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My sessions",
};

export default async function MySessionsPage() {
  await connection();
  const viewer = await requireUser();
  const sessions = await listMySessions(viewer.id);
  const now = new Date();
  const upcoming = sessions.filter((s) => s.status === "open" && Date.parse(s.endsAt) > now.getTime());
  const past = sessions.filter((s) => !upcoming.includes(s)).reverse();

  return (
    <main className="min-w-0">
      <PageHeader title="My sessions" action={{ href: "/sessions/new", label: "Host a session" }} />
      <MySessionsTabs upcoming={upcoming} past={past} now={now} viewerId={viewer.id} />
    </main>
  );
}
