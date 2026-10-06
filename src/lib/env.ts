// Environment variable access, with fail-fast errors on missing config.
//
// Each getter throws a clear, actionable error when its value is missing, so a
// misconfigured deploy fails loudly instead of somewhere deep in a request.
// They are functions rather than constants so that importing this module never
// throws -- the build and the unit tests run without real values.
//
// Every read is a literal `process.env.NEXT_PUBLIC_...` expression on purpose:
// Next.js inlines those into the client bundle only when written out in full.
// `process.env[name]` would be undefined in the browser.
//
// Never give a server-only key the NEXT_PUBLIC_ prefix: that prefix is what
// inlines a value into the client bundle.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Locally: copy .env.example to ` +
        `.env.local and fill it in. Deployed: add it in Vercel under ` +
        `Settings -> Environment Variables, then redeploy.`,
    );
  }
  return value;
}

/** Supabase project URL and publishable (anon) key. Both are browser-safe. */
export function supabaseEnv(): { url: string; anonKey: string } {
  const url = required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const anonKey = required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  // The easiest mistake is pasting the Postgres connection string, which also
  // contains the database password. Catch it before it goes anywhere.
  if (!/^https?:\/\//.test(url)) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the project's https://<ref>.supabase.co " +
        "URL (Project Settings -> Data API), not a postgresql:// connection string.",
    );
  }

  return { url, anonKey };
}

/**
 * Supabase secret key. SERVER ONLY: it bypasses Row Level Security on every
 * table. Read by src/lib/supabase/admin.ts and nowhere else, which uses it
 * only to write `locations` (ADR 0008 rule 12).
 */
export function supabaseSecretKey(): string {
  const key = required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);

  // The publishable key sits next to it in the dashboard. Pasted here it
  // would make every location write fail on RLS, far from the cause.
  if (key.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SECRET_KEY is set to the publishable key. Use the secret key " +
        "(Project Settings -> API Keys, \"secret\"; locally, `npm run db:status`).",
    );
  }

  return key;
}

/** Maps JavaScript API key. Ships to the browser; restrict it by HTTP referrer. */
export function googleMapsBrowserKey(): string {
  return required(
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  );
}

/** Server-side Places key. Server only; restrict it by API and a daily quota, not IP (ADR 0008). */
export function googleMapsServerKey(): string {
  return required(
    "GOOGLE_MAPS_SERVER_API_KEY",
    process.env.GOOGLE_MAPS_SERVER_API_KEY,
  );
}

/** Only this email domain may sign up. Enforced in the database, not here. */
export const ALLOWED_EMAIL_DOMAIN = "vanderbilt.edu";

/**
 * Centre of the area within which a session may be located.
 *
 * TODO: confirm these coordinates against a real map (TASK-01).
 */
export const CAMPUS_CENTER = { lat: 36.1447, lng: -86.8027 };

/**
 * The time zone every session time is shown in: campus's, not the viewer's
 * and not the server's.
 *
 * Why explicit: session times are stored and passed around as UTC instants
 * (`timestamptz`, ISO strings ending in `Z`). Server Components format them,
 * and on Vercel the server runs in UTC -- so `toLocaleTimeString()` without a
 * `timeZone` would show a 2 PM session as 7 PM (8 PM in winter). Naming the
 * zone also makes the answer the same on every machine, CI included, and
 * matches what a student means by "2 PM": everyone meeting is on campus.
 * Pass it to `Intl.DateTimeFormat`; see src/lib/format.ts.
 *
 * Times going IN use the same zone: the create form reads its
 * `datetime-local` values as campus time -- not the device's -- and converts
 * them to ISO instants before submitting (src/lib/datetime-local.ts;
 * docs/contracts.md, "Times in").
 */
export const CAMPUS_TIME_ZONE = "America/Chicago";

/**
 * How far from CAMPUS_CENTER a session may be placed.
 *
 * Deliberately generous for now -- campus plus the surrounding blocks. Tune it
 * once real sessions exist. Keep it here rather than inline: it is used both to
 * restrict Place Autocomplete and to re-validate a submitted location on the
 * server, and those two must never disagree. See ADR 0007.
 */
export const CAMPUS_RADIUS_METERS = 1500;
