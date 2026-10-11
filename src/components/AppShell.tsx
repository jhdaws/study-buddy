"use client";

/**
 * Chooses between the app shell and a bare page. Sign-in (/login, and the
 * name step under it) is a full-screen scene with no header or tab bar
 * (spec pages 9-17); everything else gets the shell.
 *
 * Why here and not with route groups: an (app) group would move
 * src/app/sessions/*, which open PRs edit. The header and tab bar are passed
 * in already rendered, so SiteHeader stays a Server Component.
 */

import { useSelectedLayoutSegment } from "next/navigation";

const BARE_SEGMENTS = new Set(["login", "auth"]);

export default function AppShell({
  header,
  tabBar,
  children,
}: {
  header: React.ReactNode;
  tabBar: React.ReactNode;
  children: React.ReactNode;
}) {
  const segment = useSelectedLayoutSegment();

  if (segment && BARE_SEGMENTS.has(segment)) {
    return <>{children}</>;
  }

  return (
    <div className="app-backdrop flex min-h-dvh flex-col">
      {header}
      {/* Bottom padding clears the floating tab bar on phones. */}
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-36 md:pt-8 md:pb-16">
        {children}
      </div>
      {tabBar}
    </div>
  );
}
