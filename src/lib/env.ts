// Environment variable access, with fail-fast errors on missing config.
//
// TODO: implement alongside the database and map work.
//   - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
//   - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY  (browser; restrict by HTTP referrer)
//   - GOOGLE_MAPS_SERVER_API_KEY       (server only; restrict by IP)
//   - throw a clear, actionable error when one is missing, so a misconfigured
//     deploy fails loudly instead of somewhere deep in a request
//
// Never give a server-only key the NEXT_PUBLIC_ prefix: that prefix is what
// inlines a value into the client bundle.

/** Only this email domain may sign up. Enforced in the database, not here. */
export const ALLOWED_EMAIL_DOMAIN = "vanderbilt.edu";

/**
 * Centre of the area within which a session may be located.
 *
 * TODO: confirm these coordinates against a real map (TASK-01).
 */
export const CAMPUS_CENTER = { lat: 36.1447, lng: -86.8027 };

/**
 * How far from CAMPUS_CENTER a session may be placed.
 *
 * Deliberately generous for now -- campus plus the surrounding blocks. Tune it
 * once real sessions exist. Keep it here rather than inline: it is used both to
 * restrict Place Autocomplete and to re-validate a submitted location on the
 * server, and those two must never disagree. See ADR 0007.
 */
export const CAMPUS_RADIUS_METERS = 1500;
