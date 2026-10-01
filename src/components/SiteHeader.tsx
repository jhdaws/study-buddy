/**
 * The app shell's header: app name, main navigation, and sign in / sign out.
 * Built by W5 (#12); rendered by src/app/layout.tsx on every page.
 *
 * Sign-in state comes from getCurrentUser() (src/lib/supabase/server.ts) --
 * NOT requireUser(), which redirects signed-out visitors and would loop on
 * /login. Since A3 (#16) a student can sign in, so this shows "Sign out" once
 * they have; it needed no change to do so.
 *
 * The lookup sits in its own component inside <Suspense>, per the Next 16
 * authentication guide ("Auth and streaming"): the rest of the page does not
 * wait on it. It reads cookies, so every page is rendered per request.
 * A layout is not re-rendered on client-side navigation, so this is display
 * only -- never an access check. Signing in or out still updates it: the
 * sign-out action changes cookies, which makes Next re-render the layout.
 */

import Link from "next/link";
import { Suspense } from "react";

import AccountMenu from "@/components/AccountMenu";
import NavLinks from "@/components/NavLinks";
import { getCurrentUser } from "@/lib/supabase/server";

export default function SiteHeader() {
  return (
    <header className="border-b border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-2 px-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-lg font-bold tracking-tight"
        >
          Study Buddy
        </Link>
        <Suspense fallback={<span aria-hidden className="min-h-11" />}>
          <Account />
        </Suspense>
      </div>
      <nav aria-label="Main" className="mx-auto w-full max-w-xl px-1">
        <NavLinks />
      </nav>
    </header>
  );
}

async function Account() {
  const user = await getCurrentUser();
  return <AccountMenu signedIn={user !== null} />;
}
