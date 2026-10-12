/**
 * The first-sign-in name step (US-01, ADR 0008 rule 1). Owner: Track A --
 * A4 (#17).
 *
 *   /login/name?next=/sessions/new
 *
 * Where /auth/confirm, verifyCode() and requireUser() send a signed-in
 * student whose profile has no display_name yet. The form is
 * <DisplayNameForm>; saveDisplayName() saves and goes on to `next`.
 *
 * - Signed out: to /login, keeping `next`.
 * - Already named: straight on to `next` -- this page is for choosing a name
 *   the first time, not (yet) for changing it.
 *
 * Not under /sessions, so the proxy does not guard it; this page checks for
 * itself. It must NOT call requireUser(), which would redirect a nameless
 * student back here forever. Reads cookies, so rendered per request.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import DisplayNameForm from "@/components/DisplayNameForm";
import { firstParam, loginPath, safeNext, safeNextPath } from "@/lib/safe-next";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a display name",
};

export default async function DisplayNamePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath(firstParam((await searchParams).next)) ?? undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(loginPath(next));
  }
  if (await fetchDisplayName(supabase, user.id)) {
    redirect(safeNext(next));
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">One more thing</h1>
      <p className="mt-1 mb-6 text-base text-neutral-600 dark:text-neutral-400">
        Choose the name other students will see. Your email address is never shown to anyone.
      </p>
      <DisplayNameForm next={next} />
    </main>
  );
}
