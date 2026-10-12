/**
 * Sign-in screen (US-01). Owner: Track A -- A3 (#16).
 *
 * <SignInForm> does the work; this page supplies the two things it needs from
 * the URL and sends anyone already signed in on their way.
 *
 * `?next=` is where the proxy was taking them before it found no session
 * (A4). It is passed straight to the form as a hidden field and checked with
 * sameOriginPath() both here and again in signIn(): it reaches us from a URL,
 * and from here it would reach an emailed link.
 *
 * `?error=link` is set by /auth/confirm when a token does not verify.
 *
 * getCurrentUser() rather than requireUser(): requireUser() redirects a
 * signed-out visitor to this very page, which would loop. A signed-in visitor
 * has no business on a sign-in form, so they go to `next` -- and if they have
 * not chosen a display name yet, A4's proxy turns them around to the name
 * step from there.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import SignInForm from "@/components/SignInForm";
import { confirmLinkErrorMessage } from "@/lib/errors";
import { safeNextPath, sameOriginPath } from "@/lib/redirects";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  // A Promise in this version of Next.js -- await it.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = sameOriginPath(params.next);

  if (await getCurrentUser()) {
    redirect(safeNextPath(next));
  }

  return (
    <main>
      <h1 className="text-2xl font-semibold">Sign in to Study Buddy</h1>
      <p className="mt-1 mb-6 text-base text-neutral-600 dark:text-neutral-400">
        Study Buddy is for Vanderbilt students. Signing in with your Vanderbilt
        address is how we know you&apos;re one of them.
      </p>
      <SignInForm
        next={next ?? undefined}
        notice={params.error === "link" ? confirmLinkErrorMessage() : undefined}
      />
    </main>
  );
}
