import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "leaflet/dist/leaflet.css";
import "./globals.css";

import AppShell from "@/components/AppShell";
import SiteSidebar, { PhoneAccount } from "@/components/SiteSidebar";

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
  themeColor: "#f7f8fa",
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">`, so
// `npm run typecheck` works on a clean checkout without a build first.
//
// The shell: <AppShell> wraps every page in the sidebar and top bar
// (2026-10-20 redesign; on phones the sidebar is a drawer) --
// except sign-in, which is a full-screen scene. Inter is self-hosted from npm (@fontsource-variable),
// so builds do not need to reach Google Fonts. Pages render their own <main>.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-page">
        <AppShell sidebar={<SiteSidebar />} phoneAccount={<PhoneAccount />}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
