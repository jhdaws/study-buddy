// Report an error an error boundary caught (V7, #153). A boundary catches the
// error, so Sentry's global handlers never see it; this sends it on, when
// browser monitoring is on (src/instrumentation-client.ts). Never throws.

/** Send `error` to Sentry if this build has browser monitoring; else nothing. */
export async function reportClientError(error: unknown): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    // Only once instrumentation-client.ts has initialised it with our options.
    if (Sentry.getClient()) Sentry.captureException(error);
  } catch {
    // Monitoring must never break the page it is watching.
  }
}
