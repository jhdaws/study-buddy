/**
 * The top bar's sign-in link, or the signed-in student's avatar and sign-out
 * button. Built by W5 (#12), restyled to the Claude Design spec (page 4).
 *
 * Presentational: the header decides `signedIn` and `displayName`
 * (SiteHeader.tsx) so this can be tested without a session. Sign-out is a
 * plain form posting to the signOut Server Function
 * (src/app/login/actions.ts), so it works before JavaScript loads.
 *
 * No email is ever shown here (US-25) -- only the display name's initial.
 */

import Link from "next/link";

import { signOut } from "@/app/login/actions";
import Icon from "@/components/ui/Icon";

export default function AccountMenu({
  signedIn,
  displayName = null,
}: {
  signedIn: boolean;
  displayName?: string | null;
}) {
  if (!signedIn) {
    return (
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center rounded-full bg-navy-900 px-5 text-base font-bold text-white hover:bg-navy-700"
      >
        Sign in
      </Link>
    );
  }

  const initial = displayName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        title={displayName ?? undefined}
        className="grid size-11 place-items-center rounded-full bg-navy-900 text-base font-bold text-white"
      >
        {initial}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border whitespace-nowrap border-navy-900/10 bg-white/70 px-3 text-base font-semibold text-navy-900 hover:bg-white"
        >
          <Icon name="logout" />
          <span className="sr-only lg:not-sr-only">Sign out</span>
        </button>
      </form>
    </div>
  );
}
