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
 * form itself is <SignInForm>, a Client Component.
 *
 * Already signed in: straight on to `next`. getCurrentUser() uses getUser(),
 * which revalidates the token with Supabase -- not getSession().
 *
 * Reads cookies and searchParams, so it is rendered per request.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SignInForm from "@/components/SignInForm";
import { firstParam, LINK_ERROR, safeNext, safeNextPath } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

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

  return (
    <main>
      <h1 className="text-2xl font-semibold">Sign in to Study Buddy</h1>
      <p className="mt-1 mb-6 text-base text-neutral-600 dark:text-neutral-400">
        Study Buddy is for Vanderbilt students. Sign in with your Vanderbilt email to find or host
        a study session.
      </p>
      {linkFailed && (
        <p
          role="alert"
          className="mb-5 rounded-md border border-red-300 bg-red-50 p-3 text-base text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          That sign-in link has expired or was already used. Enter your email to get a new one.
        </p>
      )}
      <SignInForm next={next} />
    </main>
  );
}
