/**
 * The top bar's account control: a "Sign in" link, or the signed-in
 * student's avatar, which opens the account sheet with sign-out
 * (<AccountSheet>, spec page 15). Built by W5 (#12), restyled to the Claude
 * Design spec.
 *
 * Presentational: the header decides `signedIn` and `displayName`
 * (SiteHeader.tsx) so this can be tested without a session. No email is ever
 * shown (US-25) -- only the display name and its initial.
 */

import Link from "next/link";

import AccountSheet from "@/components/AccountSheet";

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
        className="inline-flex min-h-11 items-center rounded-full bg-navy-900 px-5 text-base font-bold whitespace-nowrap text-white hover:bg-navy-700"
      >
        Sign in
      </Link>
    );
  }
  return <AccountSheet displayName={displayName} />;
}
