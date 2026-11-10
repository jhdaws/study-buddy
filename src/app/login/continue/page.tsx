/**
 * Where the emailed sign-in link lands (US-01, A7):
 *
 *   /login/continue?token_hash=...&type=email&next=/sessions/new
 *
 * /auth/confirm sends the link here without verifying it. Nothing is spent
 * until the student presses "Continue signing in", which posts to
 * confirmSignIn(). Outlook's link scanner opens links before the student
 * does; it doesn't press buttons, so the token (and the email's code, which
 * is the same token) survives it. Details: src/lib/email-link.ts.
 *
 * - A missing token or a type we never send: back to /login?error=link.
 * - `next` only ever survives as a same-origin path (safeNextPath).
 * - No referrer: the token is in this page's URL.
 *
 * Not under /sessions, so the proxy does not guard it; it needs no sign-in.
 * Reads searchParams, so rendered per request.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { confirmSignIn } from "@/app/login/actions";
import AuthScene from "@/components/AuthScene";
import { BUTTON_ON_DARK } from "@/components/ui/styles";
import { isAcceptedLinkType, loginWithLinkError } from "@/lib/email-link";
import { firstParam, safeNextPath } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Finish signing in",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function ContinueSignInPage({
  searchParams,
}: {
  searchParams: Promise<{
    token_hash?: string | string[];
    type?: string | string[];
    next?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const tokenHash = firstParam(params.token_hash);
  const type = firstParam(params.type);
  const next = safeNextPath(firstParam(params.next)) ?? undefined;

  if (!tokenHash || !isAcceptedLinkType(type)) {
    redirect(loginWithLinkError(next));
  }

  return (
    <AuthScene>
      <main>
        <h1 className="text-center text-[26px] leading-tight font-bold tracking-tight">
          Finish signing in
        </h1>
        <p className="mt-2 mb-6 text-center text-base text-white/80">
          Tap the button to sign in to Study Buddy on this device.
        </p>
        <form action={confirmSignIn} className="flex flex-col gap-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={type} />
          {next && <input type="hidden" name="next" value={next} />}
          <button type="submit" className={`${BUTTON_ON_DARK} w-full`}>
            Continue signing in
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-white/72">
          Didn&apos;t ask to sign in? Close this page. Nothing happens until you press the button.
        </p>
      </main>
    </AuthScene>
  );
}
