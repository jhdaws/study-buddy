"use client";

/**
 * Chooses between the app shell and a bare page. Sign-in (/login, and the
 * name step under it) is a full-screen scene with no header or tab bar
 * (spec pages 9-17); everything else gets the shell.
 *
 * Below lg: the top bar, one centred column, and (below md) the floating
 * tab bar. From lg up: the spec's desktop layout (page 18), a sticky glass
 * sidebar beside a wider content area that pages may split into columns.
 * Phones stay single-column (ADR 0004); see the dated note there.
 *
 * Why here and not with route groups: an (app) group would move
 * src/app/sessions/*, which open PRs edit. The header and tab bar are passed
 * in already rendered, so SiteHeader stays a Server Component.
 */

import { useSelectedLayoutSegment } from "next/navigation";

const BARE_SEGMENTS = new Set(["login", "auth"]);

export default function AppShell({
  header,
  sidebar,
  tabBar,
  children,
}: {
  header: React.ReactNode;
  sidebar: React.ReactNode;
  tabBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();

  if (segment && BARE_SEGMENTS.has(segment)) {
    return <>{children}</>;
  }

  return (
    <div className="app-backdrop min-h-dvh lg:flex">
      <div className="sticky top-0 hidden h-dvh w-72 shrink-0 p-4 pr-0 lg:block">{sidebar}</div>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        {header}
        {/* Bottom padding clears the floating tab bar on phones. */}
        <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-36 md:pt-8 md:pb-16 lg:max-w-6xl lg:px-8 lg:pt-8">
          {children}
        </div>
      </div>
      {tabBar}
    </div>
  );
}
