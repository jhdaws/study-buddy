/**
 * The app shell's top bar: logo, main navigation (wider screens; phones use
 * <TabBar>), and sign in / sign out. Built by W5 (#12), restyled to the
 * Claude Design spec (page 4, "Top app bar"). Rendered via <AppShell> on
 * every page except sign-in.
 *
 * Sign-in state comes from getCurrentUser() (src/lib/supabase/server.ts) --
 * NOT requireUser(), which redirects signed-out visitors and would loop on
 * /login.
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
import Logo from "@/components/ui/Logo";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white lg:hidden">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-3 px-4">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden md:block">
          <NavLinks />
        </nav>
        <Suspense fallback={<span aria-hidden className="size-11" />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}

async function Account() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Display only (the avatar's initial): a failed read shows a generic
  // avatar rather than taking every page down with it.
  const displayName = user
    ? await fetchDisplayName(supabase, user.id).catch(() => null)
    : null;
  return <AccountMenu signedIn={user !== null} displayName={displayName} />;
}
