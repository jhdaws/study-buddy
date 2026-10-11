import type { Metadata } from "next";
import "@fontsource-variable/manrope";
import "./globals.css";

import AppShell from "@/components/AppShell";
import SiteHeader from "@/components/SiteHeader";
import TabBar from "@/components/TabBar";

export const metadata: Metadata = {
  // Pages set a plain `title`; the template adds the app name after it.
  title: {
    default: "Study Buddy",
    template: "%s · Study Buddy",
  },
  description:
    "Find and join study sessions happening across Vanderbilt's campus.",
};

// The app is used one-handed, walking across campus -- see
// docs/adr/0004-mobile-first.md. `viewportFit: cover` lets the tab bar use
// env(safe-area-inset-bottom) on iPhones.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a1a36",
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">`, so
// `npm run typecheck` works on a clean checkout without a build first.
//
// The shell: <AppShell> wraps every page in the top bar, one centred,
// single-column container (ADR 0004: a max-width cap, not a desktop grid
// that collapses) and the phone tab bar -- except sign-in, which is a
// full-screen scene. Manrope is self-hosted from npm (@fontsource-variable),
// so builds do not need to reach Google Fonts. Pages render their own <main>.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-sky-100">
        <AppShell header={<SiteHeader />} tabBar={<TabBar />}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
