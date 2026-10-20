/**
 * The choose-a-password step (US-01, A6). Owner: Track A.
 *
 *   /login/password?next=/sessions/new
 *
 * Where verifyCode() sends every student who signed in by code -- new here,
 * or forgot their password -- after the name step if they still need one;
 * and where requireUser() sends a signed-in student who has no password yet
 * (everyone who signed up before passwords existed). The form is
 * <SetPasswordForm>; setPassword() saves it and goes on to `next`.
 *
 * - Signed out: to /login, keeping `next`.
 * - Already has a password: the page still works, as "choose a new
 *   password".
 *
 * Not under /sessions, so the proxy does not guard it; this page checks for
 * itself. It must NOT call requireUser(), which would redirect a student
 * without a password back here forever. Reads cookies, so rendered per
 * request.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthScene from "@/components/AuthScene";
import SetPasswordForm from "@/components/SetPasswordForm";
import { firstParam, loginPath, safeNextPath } from "@/lib/safe-next";
import { getCurrentUser, hasPassword } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Choose a password",
};

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const next = safeNextPath(firstParam((await searchParams).next)) ?? undefined;

  const user = await getCurrentUser();
  if (!user) {
    redirect(loginPath(next));
  }

  return (
    <AuthScene>
      <main>
        <h1 className="text-center text-[26px] leading-tight font-bold tracking-tight">
          {hasPassword(user) ? "Choose a new password" : "Choose a password"}
        </h1>
        <p className="mt-2 mb-6 text-center text-base text-white/80">
          Next time, sign in with your Vanderbilt email and this password. No email needed.
        </p>
        <SetPasswordForm next={next} />
      </main>
    </AuthScene>
  );
}
