/**
 * The sidebar's contents (2026-10-20 redesign): logo, MAIN MENU, COURSES (the
 * courses of sessions the student has hosted or joined), Help, and the
 * account control at the foot. <AppShell> places it: fixed on desktop, a
 * drawer on phones. Also exports the phone top bar's account control.
 *
 * Server Components: they read the student via getShellData(), cached per
 * request, inside <Suspense> so pages never wait on the sidebar. Display
 * only, never an access check.
 */

import Link from "next/link";
import { Suspense } from "react";

import AccountMenu from "@/components/AccountMenu";
import { CourseList, MainMenu } from "@/components/SidebarNav";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";
import { getShellData } from "@/lib/shell-data";

const LABEL = "px-2 text-[11px] font-semibold tracking-[0.06em] text-ink-2 uppercase";

export default function SiteSidebar() {
  return (
    <>
      <Link href="/" className="flex h-10 items-center rounded-lg px-2">
        <Logo />
      </Link>

      <p className={`mt-5 mb-1.5 ${LABEL}`}>Main menu</p>
      <nav aria-label="Main">
        <Suspense fallback={null}>
          <MainMenu />
        </Suspense>
      </nav>

      <div className="mt-6 mb-1.5 flex items-center justify-between pr-0.5">
        <p className={LABEL}>Courses</p>
        <Link
          href="/sessions"
          aria-label="Browse sessions by course"
          className="flex size-6 items-center justify-center rounded-md text-ink-2 hover:bg-column"
        >
          <Icon name="plus" />
        </Link>
      </div>
      <Suspense fallback={null}>
        <Courses />
      </Suspense>

      <div className="mt-auto flex flex-col gap-0.5 pt-4">
        <a
          href="https://github.com/jhdaws/study-buddy#readme"
          target="_blank"
          rel="noreferrer"
          className="flex h-9 min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm text-ink hover:bg-column lg:min-h-9"
        >
          <span className="text-ink-2">
            <Icon name="help" />
          </span>
          Help
        </a>
        <div className="my-2 h-px bg-line" />
        <Suspense fallback={<div className="h-11" />}>
          <Account placement="sidebar" />
        </Suspense>
      </div>
    </>
  );
}

async function Courses() {
  const shell = await getShellData();
  return <CourseList courses={shell.signedIn ? shell.courses : []} />;
}

async function Account({ placement }: { placement: "sidebar" | "topbar" }) {
  const shell = await getShellData();
  if (!shell.signedIn) return <AccountMenu signedIn={false} placement={placement} />;
  return (
    <AccountMenu
      signedIn
      placement={placement}
      displayName={shell.displayName}
      email={shell.email}
      hosting={shell.hosting}
      joined={shell.joined}
      courses={shell.courses.length}
    />
  );
}

/** The phone top bar's account control. */
export function PhoneAccount() {
  return (
    <Suspense fallback={<span className="size-11" />}>
      <Account placement="topbar" />
    </Suspense>
  );
}
