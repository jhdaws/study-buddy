// The location picker's calls to Google, without React: Places Autocomplete
// (New) as the host types, and the one lookup that puts a pin on the map.
// Owner: Track M -- M2 (#23). The component is src/components/PlacesPicker.tsx.
//
// CLIENT-SAFE. It runs in the browser with NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
// which is public by design and restricted by HTTP referrer (M1). Nothing
// here is a control: resolvePlace() (src/lib/places.ts) re-checks the radius
// and place type on the server, with the server key, before anything is
// stored. This only shapes what the picker offers.
//
// WHY THE WEB SERVICE AND NOT THE MAPS JAVASCRIPT LIBRARY'S AUTOCOMPLETE
// (which #84 used). Two things the ticket asks for need it:
//   1. Session tokens that reach the server. resolvePlace() closes the
//      Autocomplete session by sending the same token to Place Details, so
//      the token has to be a string the form can submit. The library's
//      AutocompleteSessionToken is opaque -- there is no way to read it.
//      Here the token is our own UUID v4, which Google recommends.
//   2. A circle. The library's `locationRestriction` takes only a rectangle;
//      the web service takes the same circle resolvePlace() checks against
//      (CAMPUS_CENTER, CAMPUS_RADIUS_METERS), so the two agree.
// Places API (New) accepts the browser key from the referrers it is
// restricted to, the same way the library does (checked 2026-11-09 from
// http://localhost:3000).

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";
import type { LatLng } from "@/lib/geo";
import { isWellFormedPlaceId, parsePlaceDetails } from "@/lib/place-policy";

const PLACES_API = "https://places.googleapis.com/v1";
export const AUTOCOMPLETE_URL = `${PLACES_API}/places:autocomplete`;

/**
 * The place types the picker asks for, matched against each place's PRIMARY
 * type. Google allows at most five. Checked against live results near campus
 * on 2026-11-09:
 *   - `university`: Featheringill Hall, both Stevenson Center entries,
 *     Alumni Hall, The Commons Center.
 *   - `academic_department`: Kirkland Hall, Garland Hall, the Ingram Studio
 *     Arts Center -- buildings Google does not type `university`.
 *   - `library`: Central, Stevenson Science & Engineering, Eskind, Divinity.
 *   - `cafe`, `coffee_shop`: Google types many coffee places only as the
 *     second, so both are needed.
 * Not offered, by this list: residence halls typed as housing (Branscomb
 * gives nothing), restaurants, bars. Also missing: Sarratt Student Center
 * (typed `association_or_organization`) and Rand (`cafeteria`); swap a type
 * in if students ask for them.
 * KNOWN GAP: E. Bronson Ingram College, a residential college, is typed
 * `university` and is offered. The server cannot tell it apart either
 * (place-policy.ts, KNOWN GAP).
 */
export const AUTOCOMPLETE_PRIMARY_TYPES = [
  "university",
  "academic_department",
  "library",
  "cafe",
  "coffee_shop",
] as const;

/** Ask for only what the picker shows. Autocomplete is not billed by field. */
const AUTOCOMPLETE_FIELD_MASK = [
  "suggestions.placePrediction.placeId",
  "suggestions.placePrediction.text.text",
  "suggestions.placePrediction.structuredFormat",
].join(",");

/**
 * The pin's lookup: coordinates only (Place Details Essentials). Sent WITHOUT
 * the session token on purpose -- the token is the server's to spend
 * (resolvePlace() closes the session with it). Display only: the server
 * looks the place up again and never trusts these coordinates.
 */
const PIN_FIELD_MASK = "location";

/** Fewest characters before the picker asks Google. */
export const MIN_QUERY_LENGTH = 2;

/** Milliseconds of quiet typing before a search goes out. */
export const SEARCH_DEBOUNCE_MS = 250;

/** The most suggestions shown (Autocomplete returns at most five anyway). */
export const MAX_SUGGESTIONS = 5;

/** One row the picker offers. */
export type PlaceSuggestion = {
  /** Google Places place ID -- what the form submits. */
  placeId: string;
  /** The place's name, e.g. "Featheringill Hall". */
  mainText: string;
  /** Where it is, e.g. "24th Avenue South, Nashville, TN, USA". May be "". */
  secondaryText: string;
};

/** A failed search: Google answered with an HTTP error. Its text is never shown. */
export class PlaceSearchError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Places Autocomplete failed with HTTP ${status}`);
    this.name = "PlaceSearchError";
    this.status = status;
  }
}

/**
 * A new Autocomplete session token: a version 4 UUID, as Google recommends.
 * 36 characters, so isWellFormedSessionToken() on the server accepts it.
 * `crypto.randomUUID()` needs a secure context: https, or localhost.
 */
export function newSessionToken(): string {
  return crypto.randomUUID();
}

/** The Autocomplete (New) request body for what the host typed. */
export function autocompleteRequestBody(input: string, sessionToken: string) {
  return {
    input,
    sessionToken,
    // A hard filter, not `locationBias` (a preference): nothing outside the
    // circle the server checks is offered.
    locationRestriction: {
      circle: {
        center: { latitude: CAMPUS_CENTER.lat, longitude: CAMPUS_CENTER.lng },
        radius: CAMPUS_RADIUS_METERS,
      },
    },
    includedPrimaryTypes: [...AUTOCOMPLETE_PRIMARY_TYPES],
    includedRegionCodes: ["us"],
    languageCode: "en",
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** `{ text: "..." }` -> "...", or "" for anything else. */
function textOf(value: unknown): string {
  return isRecord(value) && typeof value.text === "string" ? value.text.trim() : "";
}

/**
 * Read an Autocomplete (New) reply, trusting nothing about its shape. Keeps
 * place predictions with a well-formed id and a name; drops query
 * predictions, duplicates and anything malformed. At most MAX_SUGGESTIONS.
 */
export function parseAutocompleteResponse(body: unknown): PlaceSuggestion[] {
  if (!isRecord(body) || !Array.isArray(body.suggestions)) return [];

  const seen = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const suggestion of body.suggestions) {
    const prediction = isRecord(suggestion) ? suggestion.placePrediction : undefined;
    if (!isRecord(prediction)) continue;

    const { placeId } = prediction;
    if (typeof placeId !== "string" || !isWellFormedPlaceId(placeId) || seen.has(placeId)) {
      continue;
    }
    const format = isRecord(prediction.structuredFormat) ? prediction.structuredFormat : {};
    const mainText = textOf(format.mainText) || textOf(prediction.text);
    if (!mainText) continue;

    seen.add(placeId);
    suggestions.push({ placeId, mainText, secondaryText: textOf(format.secondaryText) });
    if (suggestions.length === MAX_SUGGESTIONS) break;
  }
  return suggestions;
}

type GoogleCallOptions = {
  /** NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
  apiKey: string;
  signal?: AbortSignal;
};

/**
 * Places near campus matching `input`, for one typing session.
 *
 * Throws PlaceSearchError for an HTTP error. A network failure throws
 * whatever fetch threw, and an aborted call rejects with fetch's AbortError
 * -- the caller aborts the previous search on every keystroke and ignores it.
 */
export async function searchPlaces(
  input: string,
  options: GoogleCallOptions & { sessionToken: string },
): Promise<PlaceSuggestion[]> {
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": options.apiKey,
      "X-Goog-FieldMask": AUTOCOMPLETE_FIELD_MASK,
    },
    body: JSON.stringify(autocompleteRequestBody(input, options.sessionToken)),
    signal: options.signal,
  });
  if (!response.ok) {
    throw new PlaceSearchError(response.status);
  }
  return parseAutocompleteResponse(await response.json());
}

/**
 * A chosen place's coordinates, for the map's pin -- or null if Google will
 * not say. Never throws for Google's answer: the pin is a nicety, and the
 * picker works without it. (An aborted call still rejects.)
 */
export async function fetchPlaceLocation(
  placeId: string,
  options: GoogleCallOptions,
): Promise<LatLng | null> {
  if (!isWellFormedPlaceId(placeId)) return null;

  const response = await fetch(`${PLACES_API}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": options.apiKey, "X-Goog-FieldMask": PIN_FIELD_MASK },
    signal: options.signal,
  });
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  return parsePlaceDetails(body)?.location ?? null;
}
