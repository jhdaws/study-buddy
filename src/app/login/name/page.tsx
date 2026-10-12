/**
 * The display-name step (US-01, ADR 0008 rule 1). Owner: Track A -- A4 (#17).
 *
 * docs/contracts.md left this route to A4; NAME_STEP_PATH in
 * src/lib/redirects.ts is the single place that names it, and the proxy and
 * requireUser() both redirect here.
 *
 * getCurrentUser() rather than requireUser(): requireUser() sends a user with
 * no display name to this very page, which would loop. The two cases it
 * leaves to handle here are the ones requireUser() would have covered:
 *
 *   - signed out: nothing to name, so back to /login carrying `next`
 *   - already named: they typed the URL or used the back button after
 *     saving, so send them on rather than inviting them to rename themselves.
 *     Changing a display name later is US-22, not this step.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import DisplayNameForm from "@/components/DisplayNameForm";
import {
  LOGIN_PATH,
  safeNextPath,
  sameOriginPath,
} from "@/lib/redirects";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a display name",
};

export default async function DisplayNamePage({
  searchParams,
}: {
  // A Promise in this version of Next.js -- await it.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = sameOriginPath(params.next);

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      next
        ? `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
        : LOGIN_PATH,
    );
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.display_name?.trim()) {
    redirect(safeNextPath(next));
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">What should we call you?</h1>
      <p className="mt-1 mb-6 text-base text-neutral-600 dark:text-neutral-400">
        You&apos;re signed in. Pick the name classmates will see before you
        host or join a session.
      </p>
      <DisplayNameForm next={next ?? undefined} />
    </main>
  );
}
