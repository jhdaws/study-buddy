// Server-side place resolution: a Google Places id in, a `locations` row id out.
// Owner: Track M -- M3 (#24). Called by createSession() (S3, #20).
//
// SERVER ONLY. `import "server-only"` makes importing this from a Client
// Component a build error. It matters here more than anywhere: M3 brings in
// the server Maps key and the Supabase SECRET key (ADR 0008 rule 12), and
// the secret key bypasses RLS on every table. This is the one module allowed
// to use it, and only to write `locations`.
//
// Next.js resolves "server-only" itself, so it is not a dependency;
// vitest.config.mts maps it to an empty module so tests can import this file
// (with fetch and the admin client mocked). Even so, every rule lives in
// pure, unit-tested modules without the import -- the distance check in src/lib/geo.ts; the id check,
// response parsing, excluded types and error mapping in
// src/lib/place-policy.ts -- and this file only does the I/O around them.

import "server-only";

import { googleMapsServerKey } from "@/lib/env";
import { FIXTURE_LOCATIONS } from "@/lib/fixtures";
import type { LatLng } from "@/lib/geo";
import {
  classifyPlaceDetailsError,
  isWellFormedPlaceId,
  isWellFormedSessionToken,
  judgePlace,
  parseGoogleError,
  parsePlaceDetails,
  type PlaceDetails,
} from "@/lib/place-policy";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

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
// M3 (#24). Replaced the W4 stub; signature kept, one optional parameter
// added (the stub comment's suggestion -- it breaks no caller).
//
// For a `placeId` the client sent -- untrusted input, possibly a direct POST:
//   1. Fixture ids (below) are answered without Google or the database.
//   2. The id must look like a Google id (place-policy.ts) or it is
//      `unknown_place` -- a malformed id never reaches a URL. It is still
//      encoded.
//   2b. In a production build, a real signed-in user (getCurrentUser(), not
//      requireUser()) or `lookup_failed` -- see SIGNED-IN ONLY below.
//   3. Place Details (New) with the server key, field mask `location,types`
//      (both Place Details Essentials; see FIELD_MASK), a timeout, and no
//      Next.js caching. Google's errors are mapped by
//      classifyPlaceDetailsError() and logged; its text never reaches the
//      student.
//   4. judgePlace(): excluded type, then distance from CAMPUS_CENTER. This
//      is the control; the picker's filtering is a convenience.
//   5. Upsert `locations` on `place_id` with Google's coordinates -- never
//      the client's -- and validated_at = now, through the secret-key client
//      (src/lib/supabase/admin.ts). No client write policy exists, by design.
//   6. Return { locationId }.
// No name is stored (ADR 0008 rule 14), and none is requested: displayName
// is a Pro field.
//
// MISSING CONFIGURATION is not a PlaceError. With no GOOGLE_MAPS_SERVER_API_KEY
// or SUPABASE_SECRET_KEY, env.ts throws and createSession() lets it through
// to the error page: a deploy without its keys should fail loudly, not tell
// students their place does not exist.
//
// THE FIXTURE IDS (`ChIJ-FAKE-...`) are still all the stub <LocationPicker>
// offers until M2 lands. Sent to Google they would fail, and the create form
// would stop working. So a fixture id resolves to its fixture location --
// no Google call, no database write -- ONLY while either:
//   - this is not a production build (`next dev`, tests), or
//   - this deployment has no server Maps key yet (today's production).
// A production build WITH the key refuses them as `unknown_place`, still
// without calling Google. Once M1's key is in Vercel, production therefore
// needs M2's real picker to create sessions; that is intended.
// Why this is not a bypass of the radius and type checks: it writes nothing,
// and the location ids it returns (FIXTURE_LOCATIONS, `20000000-...`) are not
// rows in any real database -- they are not seeded -- so a session pointing
// at one fails `sessions.location_id`'s foreign key once S3 saves for real.
// Any other id goes the full route above. W6 deletes this once M2 lands.
//
// SIGNED-IN ONLY. Every real lookup is a billed Google call and a write with
// the secret key. createSession() is a public POST endpoint, and its
// requireUser() is a stub returning FIXTURE_USER until A4 (#17) -- so this
// checks for itself rather than trusting its caller. In a production build
// it asks Supabase for the session's user (getUser(), revalidated); nobody,
// and the lookup is refused before Google is called. Until A4 lets anyone
// sign in, that closes the real path in production entirely, even with the
// keys set. Not checked outside production, so M3 and M2 can be tried
// locally before sign-in exists. NOT done yet: per-user rate limiting -- a
// signed-in student can still trigger lookups in a loop (Google's daily
// quota cap, M1, is the backstop).
// ===========================================================================

/** Optional extras for resolvePlace(). */
export type ResolvePlaceOptions = {
  /**
   * The picker's Autocomplete session token (M2), if it sends one. Passing it
   * ends Google's billing session with this lookup. A token Google would
   * reject is dropped, not an error: it only affects billing.
   */
  sessionToken?: string;
};

const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/";

// Both fields are in the Place Details Essentials SKU (checked 2026-09-30).
// Adding displayName or primaryType makes the call Pro -- and, when it ends an
// Autocomplete session, bills it as Enterprise + Atmosphere. Do not widen this
// without checking the pricing page.
const FIELD_MASK = "location,types";

// Long enough for a slow Google response, short enough that a hung request
// does not hold the form's pending state for the platform's whole timeout.
const LOOKUP_TIMEOUT_MS = 5_000;

const FIXTURE_ID_PREFIX = "ChIJ-FAKE-";

/** Validate a Places id and return the `locations` row to attach a session to. */
export async function resolvePlace(
  placeId: string,
  options: ResolvePlaceOptions = {},
): Promise<ResolvedPlace> {
  // fixtures.ts promises a fake id is never sent to Google, whatever happens.
  if (placeId.startsWith(FIXTURE_ID_PREFIX)) {
    const fixture = FIXTURE_LOCATIONS.find((row) => row.place_id === placeId);
    if (fixture && fixturePlacesAllowed()) {
      return { locationId: fixture.id };
    }
    throw new PlaceError("unknown_place", placeId);
  }

  if (!isWellFormedPlaceId(placeId)) {
    throw new PlaceError("unknown_place", placeId);
  }

  if (process.env.NODE_ENV === "production" && !(await getCurrentUser())) {
    console.error("resolvePlace: refused a lookup with no signed-in user", { placeId });
    throw new PlaceError("lookup_failed", placeId);
  }

  const place = await lookUpPlace(placeId, options.sessionToken);

  const verdict = judgePlace(place);
  if (verdict !== "ok") {
    throw new PlaceError(verdict, placeId);
  }

  return { locationId: await storeLocation(placeId, place.location) };
}

/** See THE FIXTURE IDS above. Checked per request, so adding the key needs no rebuild. */
function fixturePlacesAllowed(): boolean {
  return (
    process.env.NODE_ENV !== "production" || !process.env.GOOGLE_MAPS_SERVER_API_KEY
  );
}

/** Place Details (New) for one id. Throws PlaceError for every failure. */
async function lookUpPlace(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
  // Outside the try: a missing key is a config error, not a failed lookup.
  const apiKey = googleMapsServerKey();

  const url = new URL(PLACE_DETAILS_URL + encodeURIComponent(placeId));
  if (sessionToken && isWellFormedSessionToken(sessionToken)) {
    url.searchParams.set("sessionToken", sessionToken);
  }

  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK },
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      // Never Next.js's data cache: Google's terms do not allow caching
      // Places content beyond what we store deliberately.
      cache: "no-store",
    });
    body = await response.json().catch(() => null);
  } catch (error) {
    // Network failure or timeout. Log the kind, not the error object: it
    // could carry the request, and the request carries the key.
    console.error("resolvePlace: Place Details request failed", {
      placeId,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new PlaceError("lookup_failed", placeId);
  }

  if (!response.ok) {
    const googleError = parseGoogleError(body);
    const reason = classifyPlaceDetailsError(response.status, googleError);
    // Logged even when the student is told "unknown place": a run of these
    // can mean our request is wrong, not their pick.
    console.error("resolvePlace: Place Details refused", {
      placeId,
      httpStatus: response.status,
      ...googleError,
      mappedTo: reason,
    });
    throw new PlaceError(reason, placeId);
  }

  const place = parsePlaceDetails(body);
  if (!place) {
    console.error("resolvePlace: Place Details returned no usable location", { placeId });
    throw new PlaceError("lookup_failed", placeId);
  }
  return place;
}

/** Upsert the validated place and return its `locations.id`. */
async function storeLocation(placeId: string, location: LatLng): Promise<string> {
  // Outside the try, like the Maps key: a missing secret key is a config error.
  const admin = createAdminClient();

  try {
    const { data, error } = await admin
      .from("locations")
      .upsert(
        {
          place_id: placeId,
          lat: location.lat,
          lng: location.lng,
          validated_at: new Date().toISOString(),
        },
        { onConflict: "place_id" },
      )
      .select("id")
      .single();
    if (error || !data) {
      // Postgres's text goes to the server log only, never into PlaceError.
      console.error("resolvePlace: storing the location failed", {
        placeId,
        code: error?.code,
        message: error?.message,
      });
      throw new PlaceError("lookup_failed", placeId);
    }
    return data.id;
  } catch (error) {
    if (error instanceof PlaceError) throw error;
    console.error("resolvePlace: storing the location failed", {
      placeId,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw new PlaceError("lookup_failed", placeId);
  }
}
