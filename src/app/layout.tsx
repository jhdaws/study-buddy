import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/manrope";
import "./globals.css";

import AppShell from "@/components/AppShell";
import SiteHeader from "@/components/SiteHeader";
import SiteSidebar from "@/components/SiteSidebar";
import TabBar from "@/components/TabBar";
import { NONCE_HEADER } from "@/lib/security-headers";

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
// The shell: <AppShell> wraps every page in the top bar and phone tab bar
// (one centred column, ADR 0004), or from lg up the desktop sidebar --
// except sign-in, which is a full-screen scene. Manrope is self-hosted from npm (@fontsource-variable),
// so builds do not need to reach Google Fonts. Pages render their own <main>.
//
// The empty <style> carries this request's CSP nonce (SEC-10,
// src/lib/security-headers.ts). The Maps JavaScript API copies the nonce of
// the first `style[nonce]` on the page onto the <style> elements it inserts;
// Next stamps the nonce on its scripts and stylesheet links but renders no
// <style>, so without this the CSP refuses Google's styles and the map
// controls and markers render unstyled.
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  return (
    <html lang="en" className="h-full antialiased">
      <head>{nonce && <style nonce={nonce} />}</head>
      <body className="min-h-full bg-paper">
        <AppShell header={<SiteHeader />} sidebar={<SiteSidebar />} tabBar={<TabBar />}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
