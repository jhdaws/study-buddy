"use client";

/**
 * The bottom tab bar on phones. Hidden from `md` up, where <NavLinks> sits
 * in the top bar instead -- so only one "Main" navigation is ever exposed to
 * assistive technology.
 *
 * A plain bar fixed to the bottom edge, the way phone apps do it, with the
 * safe-area inset under it. Only pages that exist: Home, Host, Sessions.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import Icon, { type IconName } from "@/components/ui/Icon";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/sessions/new", label: "Host", icon: "plus" },
  { href: "/sessions", label: "Sessions", icon: "search" },
];

export default function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon }) => {
          const current = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold " +
                  (current ? "text-brand" : "text-ink-2 hover:text-ink")
                }
              >
                {icon === "plus" ? (
                  <span
                    className={`grid size-7 place-items-center rounded-lg ${current ? "bg-brand text-white" : "bg-ink-2/10 text-ink"}`}
                  >
                    <Icon name="plus" className="size-5" strokeWidth={2.25} />
                  </span>
                ) : (
                  <Icon name={icon} className="size-6" strokeWidth={current ? 2.25 : 1.75} />
                )}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
