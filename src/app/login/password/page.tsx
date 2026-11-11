/**
 * The choose-a-password step (US-01, A6). Owner: Track A.
 *
 *   /login/password?next=/sessions/new
 *
 * Where verifyCode() sends a student who signed in by code and has no
 * password yet, or who came from "Forgot your password?" -- after the name
 * step if they still need one;
 * and where requireUser() sends a signed-in student who has no password yet
 * (everyone who signed up before passwords existed). The form is
 * <SetPasswordForm>; setPassword() saves it and goes on to `next`.
 *
 * - Signed out: to /login, keeping `next`.
 * - Already has a password: the page still works, as "choose a new
 *   password", with a way out ("Keep my current password") to `next`.
 *
 * Not under /sessions, so the proxy does not guard it; this page checks for
 * itself. It must NOT call requireUser(), which would redirect a student
 * without a password back here forever. Reads cookies, so rendered per
 * request.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import AuthScene from "@/components/AuthScene";
import SetPasswordForm from "@/components/SetPasswordForm";
import { LINK_ON_DARK } from "@/components/ui/styles";
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
        {hasPassword(user) && (
          <p className="mt-4 text-center">
            <Link href={next ?? "/sessions"} className={LINK_ON_DARK}>
              Keep my current password
            </Link>
          </p>
        )}
      </main>
    </AuthScene>
  );
}
