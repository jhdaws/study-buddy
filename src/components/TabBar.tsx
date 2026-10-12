"use client";

/**
 * The floating bottom tab bar on phones (Claude Design spec, page 4,
 * "Bottom tab bar · raised Host"). Hidden from `md` up, where <NavLinks>
 * sits in the top bar instead -- so only one "Main" navigation is ever
 * exposed to assistive technology.
 *
 * Only pages that exist: Home, Host (raised, centre), Sessions. The spec's
 * My sessions and Account tabs come with those pages.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon, { type IconName } from "@/components/ui/Icon";

const SIDE_TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sessions", label: "Sessions", icon: "search" },
];

export default function TabBar() {
  const pathname = usePathname();
  const hostCurrent = pathname === "/sessions/new";

  const tab = ({ href, label, icon }: (typeof SIDE_TABS)[number]) => {
    const current = pathname === href;
    return (
      <li key={href} className="flex-1">
        <Link
          href={href}
          aria-current={current ? "page" : undefined}
          className={
            "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-semibold " +
            (current ? "text-white" : "text-white/72 hover:text-white")
          }
        >
          <Icon name={icon} className="size-6" />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
    >
      <ul className="glass-dark mx-auto flex max-w-md items-center rounded-full px-3">
        {tab(SIDE_TABS[0])}
        <li className="flex-1">
          <Link
            href="/sessions/new"
            aria-current={hostCurrent ? "page" : undefined}
            className="flex flex-col items-center gap-0.5 pb-1.5 text-xs font-semibold text-white"
          >
            <span className="-mt-7 grid size-14 place-items-center rounded-full bg-gradient-to-b from-blue-400 to-blue-600 shadow-[0_10px_24px_-6px_rgba(47,116,200,0.9)] ring-4 ring-sky-100">
              <Icon name="plus" className="size-7" strokeWidth={2.25} />
            </span>
            Host
          </Link>
        </li>
        {tab(SIDE_TABS[1])}
      </ul>
    </nav>
  );
}
