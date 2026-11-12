/**
 * The signed-in student's academic profile (US-11): major, minor, year and
 * current courses, so classmates have context before joining a session.
 * Linked from the account sheet (phones) and the sidebar's name (desktop).
 *
 *   - `requireUser()` first: signed-out visitors go to /login (the proxy
 *     sends page requests there before this runs, too), nameless ones to the
 *     name step. Its id is the only profile this page reads or edits.
 *   - `getProfile()` (src/lib/profiles.ts) for what is saved;
 *     `listDepartments()` for the "add a course" department picker.
 *   - <ProfileForm> posts to saveProfile() (./actions.ts).
 *
 * Everything here is optional. The display name is not edited here: it is
 * chosen at the name step, and changing it is a separate story.
 */

import type { Metadata } from "next";

import BlockedStudentsList from "@/components/BlockedStudentsList";
import ProfileForm from "@/components/ProfileForm";
import { PAGE_LEAD, PAGE_TITLE } from "@/components/ui/styles";
import { listMyBlocks } from "@/lib/blocks";
import { getProfile } from "@/lib/profiles";
import { listDepartments } from "@/lib/sessions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Your profile",
};

export default async function ProfilePage() {
  const user = await requireUser();
  const [profile, departments, blocks] = await Promise.all([
    getProfile(user.id),
    listDepartments(),
    // US-22: missing or failed, this is just an empty list -- never a
    // reason to take the whole profile page down.
    listMyBlocks().catch(() => []),
  ]);

  return (
    <main className="min-w-0 lg:max-w-2xl">
      <h1 className={PAGE_TITLE}>Your profile</h1>
      <p className={`${PAGE_LEAD} mb-6`}>
        Classmates see your major and year next to your name when you join a
        session, {user.displayName}. Every field is optional, and your email
        address is never shown to anyone.
      </p>
      <ProfileForm
        departments={departments}
        profile={{
          major: profile?.major ?? null,
          minor: profile?.minor ?? null,
          classYear: profile?.classYear ?? null,
          courses: profile?.courses ?? [],
        }}
      />
      <BlockedStudentsList blocks={blocks} />
    </main>
  );
}
