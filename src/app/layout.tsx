import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Study Buddy",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
