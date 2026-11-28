// Error tracking with Sentry (V7, #153). Pure and client-safe: both
// src/instrumentation.ts (the server) and src/instrumentation-client.ts (the
// browser) build their Sentry.init() options here, so what leaves the app is
// decided -- and unit tested -- in one place.
//
// OFF UNTIL A DSN IS SET. With no DSN, sentryOptions() returns null and
// Sentry is never initialised: local runs, CI, the Docker image and previews
// send nothing. The DSN goes in Vercel's Production environment only
// (docs/ops/RUNBOOK.md, "Monitoring"):
//   SENTRY_DSN              read by the server at run time
//   NEXT_PUBLIC_SENTRY_DSN  the same value, inlined into the browser bundle at
//                           build time. A DSN is not a secret -- it only lets
//                           someone SEND events to the project -- which is why
//                           Sentry is designed for it to ship to browsers.
//
// WHAT IS SENT: unhandled errors only. No performance tracing (sample rate
// 0), no session replay, no breadcrumbs from the console (our own log lines
// are already in Vercel, and they should stay there).
//
// WHAT IS NEVER SENT (Sprint 4 A09, the same rule as src/lib/log.ts): cookies
// and headers (a session token lives in a cookie), request bodies and query
// strings (form fields, a sign-in code in a link), the user's IP or email,
// and anything shaped like an email address in an error's text. sendDefaultPii
// is false, and scrubEvent() strips the rest on top, because a default can
// change in a new SDK version and this must not.

import type { ErrorEvent } from "@sentry/nextjs";

/** What sentryOptions() needs. */
export type MonitoringEnv = {
  dsn: string | undefined;
  /** "production", "staging", ... -- the same name /api/health reports. */
  environment: string;
  /** The deployed commit, so an error points at the code that threw it. */
  release: string | null;
};

/** Something shaped like an email address, stopping at brackets and quotes. */
const EMAIL = /[^\s@"'<>()[\]=,;:]+@[^\s@"'<>()[\]=,;:]+\.[a-z]{2,}/gi;

/** A DSN as Sentry issues them: https://<key>@<host>/<project id>. */
export function isSentryDsn(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username.length > 0 && /^\/\d+$/.test(url.pathname);
  } catch {
    return false;
  }
}

/** The origin events are sent to, for the browser's connect-src (src/lib/security-headers.ts). */
export function sentryOrigin(dsn: string | undefined): string | null {
  return isSentryDsn(dsn) ? new URL(dsn).origin : null;
}

function redact(text: string | undefined): string | undefined {
  return text?.replace(EMAIL, "[email]");
}

/**
 * Sentry's beforeSend: removes everything listed under WHAT IS NEVER SENT.
 * Returns the same event, changed in place, so Sentry still sends it.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.data;
    delete event.request.query_string;
    // The path is useful ("/sessions/<id>/..."); a query string is not kept.
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }
  // Only an opaque id may identify a user; never an email, name or IP.
  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }
  delete event.breadcrumbs;
  event.message = redact(event.message);
  for (const exception of event.exception?.values ?? []) {
    exception.value = redact(exception.value);
  }
  return event;
}

/** Options for Sentry.init(), or null when monitoring is off. */
export function sentryOptions({ dsn, environment, release }: MonitoringEnv) {
  if (!isSentryDsn(dsn)) return null;
  return {
    dsn,
    environment,
    release: release ?? undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // No breadcrumbs: they would copy console lines, and URLs with their
    // query strings, into every event. scrubEvent() drops any that remain.
    integrations: <T extends { name: string }>(defaults: T[]): T[] =>
      defaults.filter((integration) => integration.name !== "Breadcrumbs"),
    beforeSend: scrubEvent,
  };
}
