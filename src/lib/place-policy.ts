// What makes a Google place acceptable for a session, and how to read what
// Google says about one. Owner: Track M -- M3 (#24).
//
// Pure, and deliberately NOT server-only, for the same reason as geo.ts: the
// rules here are the security-relevant half of resolvePlace() (src/lib/
// places.ts, server only), and Vitest cannot import that file. Everything
// that decides -- the id check, the response parser, the type list, the
// verdict, the error mapping -- lives here and is unit tested; places.ts only
// does the I/O around it.
//
// THE RULE (data/README.md, "The constraint that does not change"): a session
// may only be at a public place, inside the campus radius, of a type that is
// not a residence. The picker's Autocomplete filtering (M2) only shapes what
// is offered; a direct POST can carry any place id at all, so this is the
// control. When in doubt it refuses.
//
// KNOWN GAP, not fixable here: Google has no dormitory or student-housing
// type (checked against the place-types tables, 2026-09-30). A residence hall
// Google labels `university` passes. Catching those needs data Google does
// not give us -- a later safety ticket (US-18, US-22).

import { type LatLng, isValidLatLng, isWithinCampus } from "@/lib/geo";

// ---------------------------------------------------------------------------
// Ids and session tokens -- checked before anything reaches a URL
// ---------------------------------------------------------------------------

/**
 * Longest place id we will send to Google. Google documents no maximum; real
 * ids seen are ~27 characters (`ChIJ...`) up to a few hundred for some
 * address ids. Anything longer is refused as malformed rather than sent.
 */
export const PLACE_ID_MAX_LENGTH = 512;

// Google documents no character set either. Every id in its docs, and every
// one the APIs return, is URL-safe base64: letters, digits, `-` and `_`. A
// `/` is refused on purpose -- a `places/...` resource name, or `../`, must
// never change the path we request. resolvePlace() still encodes the id.
const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Whether `placeId` looks like a Google place id: non-empty, URL-safe base64, not overlong. */
export function isWellFormedPlaceId(placeId: string): boolean {
  return placeId.length <= PLACE_ID_MAX_LENGTH && PLACE_ID_PATTERN.test(placeId);
}

// Google: "a URL and filename safe base64 string with at most 36 ASCII
// characters". It recommends a version 4 UUID, which fits.
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,36}$/;

/** Whether an Autocomplete session token is one Google would accept. */
export function isWellFormedSessionToken(token: string): boolean {
  return SESSION_TOKEN_PATTERN.test(token);
}

// ---------------------------------------------------------------------------
// Place types
// ---------------------------------------------------------------------------

/**
 * Place types that refuse a place, from Google's Places API (New) place-type
 * tables (checked 2026-09-30). A place carrying ANY of these is refused, even
 * if it also carries an allowed type -- a hotel with a cafe in its lobby is
 * still a hotel.
 *
 * Only types that exist are listed: a misspelt type would silently match
 * nothing. Add to this list freely; removing from it is a team decision.
 */
export const EXCLUDED_PLACE_TYPES: ReadonlySet<string> = new Set([
  // Housing (Table A). Where people live.
  "apartment_building",
  "apartment_complex",
  "condominium_complex",
  "housing_complex",

  // Lodging (Table A). Someone's room, not a public place.
  "bed_and_breakfast",
  "budget_japanese_inn",
  "campground",
  "camping_cabin",
  "cottage",
  "extended_stay_hotel",
  "farmstay",
  "guest_house",
  "hostel",
  "hotel",
  "inn",
  "japanese_inn",
  "lodging",
  "mobile_home_park",
  "motel",
  "private_guest_room",
  "resort_hotel",
  "rv_park",

  // Bare addresses and map points (Table B). A house has no business listing,
  // so a private residence reaches Places as one of these: allowing them is
  // free-form address entry by another name. `premise` is also how Google
  // labels some named buildings -- if M2 finds campus buildings typed only
  // `premise`, loosening this is a decision for the team, not a quiet edit.
  // The rest pin an arbitrary point (a plus code, a street, a corner); the
  // PUBLIC_PLACE_TYPES requirement below refuses them too -- listed here so
  // they stay refused if that requirement is ever loosened.
  "premise",
  "subpremise",
  "street_address",
  "street_number",
  "route",
  "intersection",
  "plus_code",
  "geocode",
]);

/**
 * A place must carry at least one of these to be accepted: Google's marker
 * that it is a business or landmark, not an address or a point on the map.
 * Every establishment Places returns carries both (Table B). This is an
 * allowlist on top of EXCLUDED_PLACE_TYPES, because a denylist alone lets
 * through every address-like type nobody thought to list.
 */
export const PUBLIC_PLACE_TYPES: ReadonlySet<string> = new Set([
  "establishment",
  "point_of_interest",
]);

// ---------------------------------------------------------------------------
// Place Details (New) responses
// ---------------------------------------------------------------------------

/** The fields resolvePlace() asks Place Details for, once checked. */
export type PlaceDetails = {
  location: LatLng;
  types: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Read a Place Details (New) success body, trusting nothing about its shape.
 *
 * Returns null when there is no usable location -- missing, not numbers, or
 * not a real coordinate. resolvePlace() treats that as `lookup_failed`, not
 * `unknown_place`: Google answered 200 for the id, so the place exists, and a
 * body without coordinates means our field mask or Google's response is
 * wrong. Worth a log line and a retry, not telling the student the place
 * does not exist.
 *
 * Missing or malformed `types` become an empty list, which judgePlace()
 * refuses: a place we cannot classify is not shown to be public.
 */
export function parsePlaceDetails(body: unknown): PlaceDetails | null {
  if (!isRecord(body) || !isRecord(body.location)) {
    return null;
  }
  const { latitude, longitude } = body.location;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return null;
  }
  const location = { lat: latitude, lng: longitude };
  if (!isValidLatLng(location)) {
    return null;
  }

  const types = Array.isArray(body.types)
    ? body.types.filter((type): type is string => typeof type === "string")
    : [];

  return { location, types };
}

/** Why judgePlace() refused a place -- a subset of PlaceErrorReason (places.ts). */
export type PlaceVerdict = "ok" | "outside_campus" | "excluded_type";

/**
 * Whether a place Google returned may host a session.
 *
 * Type first, then distance: a residence is refused as a residence wherever
 * it is. A place must carry a PUBLIC_PLACE_TYPES type and no excluded one, so
 * a place with no types at all is refused too (see parsePlaceDetails).
 */
export function judgePlace(place: PlaceDetails): PlaceVerdict {
  if (
    !place.types.some((type) => PUBLIC_PLACE_TYPES.has(type)) ||
    place.types.some((type) => EXCLUDED_PLACE_TYPES.has(type))
  ) {
    return "excluded_type";
  }
  if (!isWithinCampus(place.location)) {
    return "outside_campus";
  }
  return "ok";
}

// ---------------------------------------------------------------------------
// Place Details (New) errors
// ---------------------------------------------------------------------------

/**
 * The parts of a Google error body worth logging and branching on. The shape
 * is `{ error: { code, message, status, details } }` -- documented for the
 * Routes API, not on any Places page, so every field is optional here.
 */
export type GoogleError = {
  /** google.rpc status, e.g. "NOT_FOUND", "INVALID_ARGUMENT" */
  status?: string;
  /** ErrorInfo reason from `details`, e.g. "API_KEY_INVALID" */
  reason?: string;
  /** Google's own text: for server logs only, never for students */
  message?: string;
};

/** Read whatever Google put in an error body. Never throws; unknown shapes give `{}`. */
export function parseGoogleError(body: unknown): GoogleError {
  if (!isRecord(body) || !isRecord(body.error)) {
    return {};
  }
  const { status, message, details } = body.error;
  const info = Array.isArray(details)
    ? details.find((detail) => isRecord(detail) && typeof detail.reason === "string")
    : undefined;

  return {
    status: typeof status === "string" ? status : undefined,
    reason: isRecord(info) && typeof info.reason === "string" ? info.reason : undefined,
    message: typeof message === "string" ? message.slice(0, 300) : undefined,
  };
}

/**
 * Which PlaceError a failed Place Details call becomes. Branches on the HTTP
 * status and Google's `status`/`reason` codes, never on message text.
 *
 * - 404 / NOT_FOUND: no such place, or an obsolete id (Google's place-id
 *   guide) -> `unknown_place`.
 * - 400 with Google's INVALID_ARGUMENT: the id was well formed but Google
 *   rejected it -> `unknown_place`. The exception is a bad API key, which
 *   Google reports as 400 with reason API_KEY_INVALID: that is our
 *   misconfiguration, not the student's pick -> `lookup_failed`. (A bad field
 *   mask would also land here as `unknown_place`; ours is a constant, and
 *   every failure is logged.) A 400 whose body we could not read -- a proxy's
 *   page, or a body cut off by the timeout -- is not Google saying the id is
 *   bad -> `lookup_failed`, worth a retry.
 * - Anything else -- 401/403 (key restricted, API not enabled, billing),
 *   429 (quota cap reached), 5xx -> `lookup_failed`.
 */
export function classifyPlaceDetailsError(
  httpStatus: number,
  error: GoogleError,
): "unknown_place" | "lookup_failed" {
  if (httpStatus === 404 || error.status === "NOT_FOUND") {
    return "unknown_place";
  }
  if (
    httpStatus === 400 &&
    error.status === "INVALID_ARGUMENT" &&
    error.reason !== "API_KEY_INVALID"
  ) {
    return "unknown_place";
  }
  return "lookup_failed";
}
