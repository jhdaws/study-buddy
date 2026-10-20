"use client";

/**
 * The sidebar's main menu and Courses list (2026-10-20 redesign). A Client
 * Component only to read the current path for `aria-current="page"` and the
 * soft white pill behind the current item.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import Icon, { type IconName } from "@/components/ui/Icon";
import { departmentColours } from "@/lib/departments";
import type { ShellCourse } from "@/lib/shell-data";

const ITEMS: { href: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: "home", match: (p) => p === "/" },
  {
    href: "/sessions",
    label: "Sessions",
    icon: "sessions",
    match: (p) => p === "/sessions" || (p.startsWith("/sessions/") && p !== "/sessions/new"),
  },
  { href: "/sessions/new", label: "Host a session", icon: "host", match: (p) => p === "/sessions/new" },
  { href: "/my", label: "My sessions", icon: "mine", match: (p) => p === "/my" },
];

const ROW =
  "flex h-9 min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-ink transition-colors lg:min-h-9 hover:bg-white/85";
const CURRENT = "bg-white font-medium shadow-[0_1px_2px_rgba(17,24,39,0.06)]";

export function MainMenu() {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {ITEMS.map(({ href, label, icon, match }) => {
        const current = match(pathname);
        return (
          <li key={href}>
            <Link href={href} aria-current={current ? "page" : undefined} className={`${ROW} ${current ? CURRENT : ""}`}>
              <span className="text-ink-2">
                <Icon name={icon} />
              </span>
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CourseList({ courses }: { courses: ShellCourse[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const active = pathname === "/sessions" ? params.get("course") : null;
  if (courses.length === 0) {
    return <p className="px-2 py-1.5 text-[13px] text-ink-2 [text-wrap:pretty]">Join a session and your courses appear here</p>;
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {courses.map((course) => {
        const current = active === course.code;
        return (
          <li key={course.code}>
            <Link
              href={`/sessions?course=${encodeURIComponent(course.code)}`}
              aria-current={current ? "page" : undefined}
              className={`${ROW} ${current ? CURRENT : ""}`}
            >
              <span
                aria-hidden
                className="mx-[3px] size-2.5 shrink-0 rounded-[3px]"
                style={{ background: departmentColours(course.departmentCode).square }}
              />
              {course.code}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
