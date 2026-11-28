// Server-side instrumentation (V7, #153): Sentry error tracking. Next.js
// calls register() once when a server instance starts, and onRequestError()
// for every error it catches while handling a request -- a Server Component
// that throws, a Route Handler, a Server Action (Next 16 docs,
// file-conventions/instrumentation.md).
//
// Inert until SENTRY_DSN is set (src/lib/monitoring.ts says what is sent and
// what never is). The SDK is imported only then, so a deployment without
// monitoring does not pay for loading it on every cold start.

import type { Instrumentation } from "next";

import { sentryOptions } from "@/lib/monitoring";

/** Which deployment this is, and its commit -- the names /api/health uses. */
function deployment() {
  return {
    environment: process.env.APP_ENVIRONMENT || process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    release: process.env.APP_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || null,
  };
}

let enabled = false;

export async function register() {
  // Next 16's proxy and pages run on Node.js here; there is no Edge code.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const options = sentryOptions({ dsn: process.env.SENTRY_DSN, ...deployment() });
  if (!options) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init(options);
  enabled = true;
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!enabled) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(error, request, context);
};
