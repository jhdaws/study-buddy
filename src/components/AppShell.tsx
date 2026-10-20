"use client";

/**
 * The frame every signed-in page sits in, from the 2026-10-20 redesign:
 *
 *   desktop (lg+)  a fixed 240px sidebar on the left; beside it a 56px frosted
 *                  top bar (breadcrumb, search) over the page, which scrolls
 *                  under it at up to 1120px wide with 24px gutters
 *   phone          a 56px top bar (menu, wordmark, account); the sidebar
 *                  slides in from the left as a drawer over the page
 *
 * The page sits on a soft mist (`app-backdrop`). Sign-in (/login, /auth) is a
 * full-screen scene with no shell. The sidebar and account controls are
 * passed in already rendered, so they stay Server Components.
 */

import Link from "next/link";
import { usePathname, useRouter, useSearchParams, useSelectedLayoutSegment } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { crumbsForPath, ShellProvider, useShell } from "@/components/shell/ShellContext";
import Icon from "@/components/ui/Icon";
import Logo from "@/components/ui/Logo";

const BARE_SEGMENTS = new Set(["login", "auth"]);

export default function AppShell({
  sidebar,
  phoneAccount,
  children,
}: {
  sidebar: React.ReactNode;
  phoneAccount: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();
  if (segment && BARE_SEGMENTS.has(segment)) return <>{children}</>;

  return (
    <ShellProvider>
      <Frame sidebar={sidebar} phoneAccount={phoneAccount}>
        {children}
      </Frame>
    </ShellProvider>
  );
}

function Frame({
  sidebar,
  phoneAccount,
  children,
}: {
  sidebar: React.ReactNode;
  phoneAccount: React.ReactNode;
  children: React.ReactNode;
}) {
  const { drawerOpen, setDrawerOpen } = useShell();

  // Escape closes the drawer; the page behind it does not scroll.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [drawerOpen, setDrawerOpen]);

  return (
    <div className="app-backdrop min-h-dvh lg:flex">
      {/* Phone: dim the page behind the open drawer. */}
      {drawerOpen && (
        <div
          aria-hidden
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-[rgba(17,24,39,0.32)] lg:hidden"
        />
      )}
      <aside
        aria-label="Main navigation"
        className={
          "fixed inset-y-0 left-0 z-50 flex w-[min(300px,86vw)] flex-col overflow-y-auto p-3 [scrollbar-width:none] " +
          "border-r border-[rgba(17,24,39,0.06)] bg-white bg-cover bg-top transition-transform duration-200 " +
          "rounded-r-2xl shadow-[0_24px_64px_rgba(17,24,39,0.24)] " +
          "lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:translate-x-0 lg:rounded-none lg:shadow-none " +
          (drawerOpen ? "translate-x-0" : "-translate-x-full")
        }
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.28),rgba(255,255,255,0.28)),url(/bg/bg-pastel.webp)",
        }}
      >
        {sidebar}
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <PhoneBar account={phoneAccount} />
        <Suspense fallback={<div className="hidden h-14 lg:block" />}>
          <DesktopBar />
        </Suspense>
        <div className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-5 pb-16 lg:px-6 lg:pt-6">{children}</div>
      </div>
    </div>
  );
}

function PhoneBar({ account }: { account: React.ReactNode }) {
  const { drawerOpen, setDrawerOpen } = useShell();
  return (
    <header className="glass sticky top-0 z-30 grid h-14 grid-cols-[44px_1fr_44px] items-center border-b border-[rgba(17,24,39,0.06)] px-1.5 lg:hidden">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className="flex size-11 items-center justify-center rounded-lg text-ink"
      >
        <Icon name="menu" size={20} />
      </button>
      <Link href="/" className="flex min-h-11 items-center justify-center">
        <Logo size={24} />
      </Link>
      <div className="flex justify-end">{account}</div>
    </header>
  );
}

function DesktopBar() {
  const pathname = usePathname();
  const { crumbs } = useShell();
  const trail = crumbs ?? crumbsForPath(pathname);
  return (
    <header className="glass sticky top-0 z-30 hidden h-14 shrink-0 items-center gap-4 border-b border-[rgba(17,24,39,0.06)] px-6 lg:flex">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 text-[13px]">
        {trail.map((crumb, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && (
                <span aria-hidden className="text-ink-3">
                  ›
                </span>
              )}
              {crumb.href && !last ? (
                <Link href={crumb.href} className="truncate text-ink-2 hover:text-ink">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={`truncate ${last ? "font-semibold text-ink" : "text-ink-2"}`}>
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
      <TopSearch />
    </header>
  );
}

/** Searches the session list: Enter goes to /sessions?q=… */
function TopSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const q = query.trim();
        router.push(q ? `/sessions?q=${encodeURIComponent(q)}` : "/sessions");
      }}
      className="flex h-9 w-[260px] shrink-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 text-ink-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
    >
      <Icon name="search" />
      <input
        type="search"
        aria-label="Search sessions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search sessions, courses, places"
        className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
      />
    </form>
  );
}
