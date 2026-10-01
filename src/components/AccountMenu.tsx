/**
 * The header's sign-in link or sign-out button. Built by W5 (#12).
 *
 * Presentational: the header decides `signedIn` (SiteHeader.tsx) so this can
 * be tested without a session. Sign-out is a plain form posting to the
 * signOut Server Function (src/app/login/actions.ts, real since A3 #16),
 * so it works before JavaScript loads.
 */

import Link from "next/link";

import { signOut } from "@/app/login/actions";

const CONTROL =
  "inline-flex min-h-11 items-center rounded-md px-3 text-base font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800";

export default function AccountMenu({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) {
    return (
      <Link href="/login" className={CONTROL}>
        Sign in
      </Link>
    );
  }

  return (
    <form action={signOut}>
      <button type="submit" className={CONTROL}>
        Sign out
      </button>
    </form>
  );
}
