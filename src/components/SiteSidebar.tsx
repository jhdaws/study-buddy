/**
 * The desktop sidebar (lg and up), from the Claude Design spec page 18: the
 * logo, the main menu, and the signed-in student's card with sign-out at
 * the bottom. Below lg the top bar and the phone tab bar do this job.
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
    <aside className="glass-dark flex h-full flex-col rounded-hero p-4 text-white">
      <Link href="/" className="mb-6 inline-flex min-h-11 items-center rounded-full px-1.5">
        <Logo tone="light" />
      </Link>
      <p className="mb-2 px-3.5 text-xs font-bold tracking-wider text-white/72 uppercase">
        Main menu
      </p>
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
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-bold text-navy-900 hover:bg-sky-50"
      >
        Sign in
        <Icon name="arrowRight" />
      </Link>
    );
  }

  const displayName = await fetchDisplayName(supabase, user.id).catch(() => null);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-full bg-blue-600 font-bold"
      >
        {formatInitial(displayName)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{displayName ?? "Signed in"}</p>
        <p className="text-xs text-white/72">Display name</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="grid size-11 place-items-center rounded-full border border-white/15 bg-white/[0.06] hover:bg-white/[0.14]"
        >
          <Icon name="logout" />
        </button>
      </form>
    </div>
  );
}
