/**
 * The desktop sidebar (lg and up): the logo, the main menu, and the
 * signed-in student's name with sign-out at the bottom. Below lg the top bar and the phone tab bar do this job.
 *
 * A Server Component: the account card reads the session like SiteHeader
 * does, inside <Suspense> so nothing waits on it. Display only, never an
 * access check.
 */

import Link from "next/link";
import { Suspense } from "react";

import { signOut } from "@/app/login/actions";
import SidebarNav from "@/components/SidebarNav";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";
import { formatInitial } from "@/lib/format";
import { createClient, fetchDisplayName } from "@/lib/supabase/server";

export default function SiteSidebar() {
  return (
    <aside className="flex h-full flex-col p-4">
      <Link href="/" className="mb-6 inline-flex min-h-11 items-center rounded-lg px-2">
        <Logo />
      </Link>
      <nav aria-label="Main">
        <SidebarNav />
      </nav>
      <div className="mt-auto">
        <Suspense fallback={null}>
          <SidebarAccount />
        </Suspense>
      </div>
    </aside>
  );
}

async function SidebarAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-navy-700"
      >
        Sign in
      </Link>
    );
  }

  const displayName = await fetchDisplayName(supabase, user.id).catch(() => null);
  return (
    <div className="flex items-center gap-3 border-t border-line pt-4">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white"
      >
        {formatInitial(displayName)}
      </span>
      <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
        {displayName ?? "Signed in"}
      </p>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-11 place-items-center rounded-lg text-ink-2 hover:bg-paper hover:text-ink"
        >
          <Icon name="logout" />
        </button>
      </form>
    </div>
  );
}
