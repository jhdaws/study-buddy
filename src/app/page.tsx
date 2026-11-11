/**
 * Home. Built by W5 (#12); redrawn for the signed-in student in H1 (#128) so
 * it is about THEM, and distinct from Browse (/sessions), which is every open
 * session with search, filters and the map.
 *
 *   Signed out: what Study Buddy is, how it works, sign in.
 *   Signed in, top to bottom:
 *     - a greeting and one line of campus status
 *     - "Your upcoming sessions": open, not ended, on their roster (hosting
 *       or going), soonest first
 *     - "New in your courses" (N1, US-17): created since their last visit
 *     - "In your courses": other open sessions in their profile's current
 *       courses (US-11), with a link to Browse filtered to the course
 *     - "Requests in your courses" (US-16), each with "Host one"
 *     - "Your past sessions" (US-15, #133): ended or cancelled, with "Host it
 *       again", which prefills the create form with the course
 *     - a prompt to host, and the way to Browse
 *   With no courses on their profile, the two course sections become one
 *   nudge to add them.
 *
 * Every read is independent and fails on its own: a section whose read
 * failed is left out (the campus status line says so when the session list
 * is the one that failed), never the whole page.
 *
 * `?account=deleted` (US-24): deleteAccount() lands here, signed out, and
 * the page confirms the deletion above the signed-out home.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import HomeSignedIn from "@/components/HomeSignedIn";
import { BUTTON_ON_DARK, SECTION_TITLE } from "@/components/ui/styles";
import { isAccountDeletedNotice } from "@/lib/account";
import { listNewSessionsInMyCourses } from "@/lib/course-notifications";
import { getProfile } from "@/lib/profiles";
import {
  listMySessions,
  listPastSessions,
  listSessions,
  type MySession,
  type PastSession,
} from "@/lib/sessions";
import { listStudyRequests, type StudyRequestGroup } from "@/lib/study-requests";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Study Buddy" },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <SignedOutHome accountDeleted={isAccountDeletedNotice(await searchParams)} />;
  }

  // In parallel, and each on its own: one failed read drops one section.
  const [displayName, sessions, newSessions, mine, past, profile, requests] = await Promise.all([
    fetchDisplayName(supabase, user.id).catch(() => null),
    listSessions().catch(() => null),
    // Missing enrolment data, or any other failure, just means no nudge.
    listNewSessionsInMyCourses().catch(() => []),
    listMySessions(user.id).catch(() => [] as MySession[]),
    listPastSessions(user.id).catch(() => [] as PastSession[]),
    getProfile(user.id).catch(() => null),
    listStudyRequests().catch(() => [] as StudyRequestGroup[]),
  ]);

  return (
    <HomeSignedIn
      displayName={displayName}
      sessions={sessions}
      newSessions={newSessions}
      mine={mine}
      past={past}
      courses={profile?.courses ?? []}
      requests={requests}
      now={new Date()}
    />
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

function SignedOutHome({ accountDeleted = false }: { accountDeleted?: boolean }) {
  return (
    <main className="min-w-0">
      {accountDeleted && (
        <p
          role="status"
          className="mb-5 rounded-xl border border-line bg-white px-4 py-3 text-[15px] font-semibold text-ink"
        >
          Your account and your data have been deleted. Thanks for studying with us.
        </p>
      )}
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
