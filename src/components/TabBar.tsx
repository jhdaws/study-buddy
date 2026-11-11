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

/** The most a tab's badge spells out; past it, "9+" rather than crowding the icon. */
const BADGE_MAX = 9;

export default function TabBar({ newSessionsCount = 0 }: { newSessionsCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, icon }) => {
          const current = pathname === href;
          // N1/US-17: new sessions in the student's own courses since they
          // last opened Home or Sessions -- whichever tab they land on next
          // clears it, so it is shown here and not duplicated on Home.
          const badge = href === "/sessions" && newSessionsCount > 0 ? newSessionsCount : 0;
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
                  <span className="relative">
                    <Icon name={icon} className="size-6" strokeWidth={current ? 2.25 : 1.75} />
                    {badge > 0 && (
                      <span
                        aria-hidden
                        className="absolute -top-1 -right-1.5 grid min-w-[1.1rem] place-items-center rounded-full bg-signal px-1 text-[10px] leading-[1.1rem] font-bold text-white"
                      >
                        {badge > BADGE_MAX ? `${BADGE_MAX}+` : badge}
                      </span>
                    )}
                  </span>
                )}
                {label}
                {badge > 0 && (
                  <span className="sr-only">
                    , {badge} new {badge === 1 ? "session" : "sessions"} in your courses
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
