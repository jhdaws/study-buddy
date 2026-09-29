// Server-side place resolution: a Google Places id in, a `locations` row id out.
// Owner: Track M -- M3 (#24). Called by createSession() (S3, #20).
//
// SERVER ONLY. `import "server-only"` makes importing this from a Client
// Component a build error. It matters here more than anywhere: M3 brings in
// the server Maps key and the Supabase SECRET key (ADR 0008 rule 12), and
// the secret key bypasses RLS on every table. This is the one module allowed
// to use it, and only to write `locations`.
//
// Next.js resolves "server-only" itself, so it is not a dependency; Vitest
// cannot import this file. Put pure helpers -- M3's distance check, which is
// unit tested -- in a separate module without the import (src/lib/geo.ts,
// say) and import them here.

import "server-only";

import { FIXTURE_LOCATIONS } from "@/lib/fixtures";

export type ResolvedPlace = {
  /** `locations.id` -- what `sessions.location_id` references */
  locationId: string;
};

/** Why a place was refused. S3 shows `PlaceError.message` against `placeId`. */
export type PlaceErrorReason =
  | "unknown_place" // Google has no such place (or the id is malformed)
  | "outside_campus" // farther than CAMPUS_RADIUS_METERS from CAMPUS_CENTER
  | "excluded_type" // a residence, or another type the picker does not offer
  | "lookup_failed"; // Google or the database was unreachable -- worth a retry

const MESSAGES: Record<PlaceErrorReason, string> = {
  unknown_place: "We couldn't find that place. Choose a location from the list.",
  outside_campus: "That place is too far from campus. Choose somewhere closer.",
  excluded_type: "Sessions can't be held there. Choose a public place.",
  lookup_failed: "We couldn't check that location just now. Try again.",
};

/**
 * Thrown by resolvePlace() when a place cannot be used. `message` is written
 * for students and is safe to show; `reason` is for code.
 */
export class PlaceError extends Error {
  readonly reason: PlaceErrorReason;
  readonly placeId: string;

  constructor(reason: PlaceErrorReason, placeId: string) {
    super(MESSAGES[reason]);
    this.name = "PlaceError";
    this.reason = reason;
    this.placeId = placeId;
  }
}

// ===========================================================================
// STUB (W4, #11) -- replaced by M3 (#24). Keep the signature.
//
// Maps FIXTURE_PLACES' fake ids to FIXTURE_LOCATIONS; anything else is
// "unknown_place". No network, no database.
//
// The real body must, for a `placeId` the client sent (untrusted input):
//   1. Look the place up with Places API (New) Place Details, using the
//      server key (googleMapsServerKey()). Request only the fields needed --
//      location and types -- to keep the SKU cheap. Encode the id in the URL.
//      If the picker used a session token, accepting it here may let Google
//      bill the typing and this lookup as one session (M1 checks the pricing).
//      To pass it, ADD an optional second parameter -- `resolvePlace(placeId,
//      { sessionToken })` -- and a form field; that breaks no caller.
//   2. Check the distance from CAMPUS_CENTER against CAMPUS_RADIUS_METERS
//      (both in src/lib/env.ts -- the picker restricts with the same values)
//      and the place types. The picker's filtering is a convenience, this is
//      the control (data/README.md, "The constraint that does not change").
//   3. Upsert `locations` on `place_id` with the coordinates Google returned
//      -- never ones from the client -- and a fresh `validated_at`, using the
//      Supabase secret key (SUPABASE_SECRET_KEY, never NEXT_PUBLIC_). No
//      client write policy exists on `locations`, by design.
//   4. Return { locationId }. Throw PlaceError for every refusal; never leak
//      Google's or Postgres's own error text.
// Do not store the place's name (ADR 0008 rule 14): the session carries the
// host's label.
// ===========================================================================

/** Validate a Places id and return the `locations` row to attach a session to. */
export async function resolvePlace(placeId: string): Promise<ResolvedPlace> {
  const location = FIXTURE_LOCATIONS.find((row) => row.place_id === placeId);
  if (!location) {
    throw new PlaceError("unknown_place", placeId);
  }
  return { locationId: location.id };
}
