// Browser-side instrumentation (V7, #153): Sentry for errors nothing in the
// app caught. Next.js runs this file before the app's own code, in every
// browser (Next 16 docs, file-conventions/instrumentation-client.md).
//
// NEXT_PUBLIC_SENTRY_DSN is inlined at build time, so a build without it --
// local, CI, previews -- ships no Sentry at all and never downloads the SDK.
// With it, the SDK loads in its own chunk after the page, and the browser
// may send events only to Sentry's origin, which src/proxy.ts adds to the
// CSP's connect-src. What is sent, and what never is: src/lib/monitoring.ts.
//
// Errors the app's own error boundaries catch (sessions/error.tsx) are
// reported by reportClientError() in src/lib/monitoring-client.ts instead.

import { sentryOptions } from "@/lib/monitoring";

const options = sentryOptions({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "unknown",
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null,
});

if (options) {
  import("@sentry/nextjs")
    .then((Sentry) => Sentry.init(options))
    .catch(() => {
      // Monitoring must never break the page it is watching.
    });
}
