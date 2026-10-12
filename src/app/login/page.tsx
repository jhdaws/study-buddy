/**
 * Sign-in screen (US-01). Owner: Track A -- A3 (#16).
 *
 *   /login                          the form
 *   /login?next=/sessions/new       ...and go there after signing in
 *   /login?error=link&next=...     /auth/confirm sent them back: the link
 *                                   had expired or was already used
 *
 * A Server Component: it checks `next` (safeNextPath -- anything else is
 * dropped, never passed on) and maps `error` to our own message (any value
 * other than LINK_ERROR is ignored, so nothing from the URL is echoed). The
 * form itself is <SignInForm>, a Client Component, inside <AuthScene> (the
 * Claude Design sign-in scene, spec pages 9-17).
 *
 * Already signed in: straight on to `next`. getCurrentUser() uses getUser(),
 * which revalidates the token with Supabase -- not getSession().
 *
 * Reads cookies and searchParams, so it is rendered per request.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import AuthScene from "@/components/AuthScene";
import SignInForm from "@/components/SignInForm";
import Icon from "@/components/ui/Icon";
import { FORM_ERROR } from "@/components/ui/styles";
import { firstParam, LINK_ERROR, safeNext, safeNextPath } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

/** Why a redirected visitor is here (spec 5.8). Only for paths we know. */
function reasonFor(next: string | undefined): string | null {
  if (!next) return null;
  if (next.startsWith("/sessions/new")) return "Sign in to host a session.";
  if (next.startsWith("/sessions")) return "Sign in to see study sessions.";
  return null;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const next = safeNextPath(firstParam(params.next)) ?? undefined;

  if (await getCurrentUser()) {
    redirect(safeNext(next));
  }

  const linkFailed = firstParam(params.error) === LINK_ERROR;
  const reason = reasonFor(next);

  return (
    <AuthScene>
      <main>
        {linkFailed ? (
          <p role="alert" className={`${FORM_ERROR} mb-5`}>
            That sign-in link has expired or was already used. Enter your email to get a new
            code.
          </p>
        ) : (
          reason && (
            <p className="mb-5 flex items-center gap-2 rounded-inner border border-blue-300/30 bg-blue-500/15 px-4 py-3 text-sm font-medium text-white">
              <Icon name="calendar" className="size-5 shrink-0 text-blue-200" />
              {reason}
            </p>
          )
        )}
        <SignInForm next={next} />
      </main>
    </AuthScene>
  );
}
