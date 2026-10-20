// What the app shell shows about the signed-in student: their name and email
// for the account menu, and their sessions for the sidebar's Courses list and
// the menu's counts. Server only; cached per request, so the sidebar and the
// phone header share one lookup.
//
// Display only, never an access check: pages call requireUser() themselves.
// A failure here shows an empty shell rather than taking the page down.

import "server-only";

import { cache } from "react";

import { listMySessions, type MySession } from "@/lib/sessions";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export type ShellCourse = { code: string; departmentCode: string };

export type ShellData =
  | { signedIn: false }
  | {
      signedIn: true;
      displayName: string | null;
      email: string | null;
      hosting: number;
      joined: number;
      courses: ShellCourse[];
    };

/** Distinct course codes from the student's sessions, most recent first. */
export function coursesFrom(sessions: MySession[]): ShellCourse[] {
  const seen = new Map<string, ShellCourse>();
  for (const s of [...sessions].reverse()) {
    const code = `${s.course.departmentCode} ${s.course.number}`;
    if (!seen.has(code)) seen.set(code, { code, departmentCode: s.course.departmentCode });
  }
  return [...seen.values()];
}

export const getShellData = cache(async (): Promise<ShellData> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false };

  const [displayName, sessions] = await Promise.all([
    fetchDisplayName(supabase, user.id).catch(() => null),
    listMySessions(user.id).catch(() => [] as MySession[]),
  ]);
  const now = Date.now();
  const upcoming = sessions.filter((s) => s.status === "open" && Date.parse(s.endsAt) > now);
  return {
    signedIn: true,
    displayName,
    email: user.email ?? null,
    hosting: upcoming.filter((s) => s.hostId === user.id).length,
    joined: upcoming.filter((s) => s.hostId !== user.id).length,
    courses: coursesFrom(sessions),
  };
});
