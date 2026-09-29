import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import SiteHeader from "@/components/SiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
// docs/adr/0004-mobile-first.md.
export const viewport = {
  width: "device-width",
  initialScale: 1,
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">`, so
// `npm run typecheck` works on a clean checkout without a build first.
//
// The shell (W5, #12): the header on every page, then one centred,
// single-column container (ADR 0004: a max-width cap, not a desktop grid that
// collapses). Pages render their own <main> inside it.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <div className="mx-auto w-full max-w-xl flex-1 px-4 pt-6 pb-12">
          {children}
        </div>
      </body>
    </html>
  );
}
