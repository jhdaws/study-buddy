// The location picker's search logic, kept pure so it is unit tested without
// Google or a browser. Owner: Track M -- M2 (#23). The I/O (Google's
// Autocomplete, the map) lives in src/components/LocationPicker.tsx.

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";
import { FIXTURE_PLACES, type FixturePlace } from "@/lib/fixtures";

/** One row the picker offers, whichever source it came from. */
export type PlaceSuggestion = {
  /** Google Places place ID -- what the form submits. */
  placeId: string;
  /** The place's name, e.g. "Featheringill Hall". */
  mainText: string;
  /** Where it is, e.g. "Vanderbilt University, Nashville". */
  secondaryText: string;
  /** Known coordinates, when the source has them (fixtures do; Google needs a lookup). */
  location?: { lat: number; lng: number };
};

/**
 * Place types Autocomplete (New) is asked for. Google allows at most five.
 * These are meant to surface campus buildings (`university`), libraries and
 * cafes but not residences; the server's EXCLUDED_PLACE_TYPES is the control.
 * M1's checklist: confirm Featheringill and Stevenson appear with this list.
 */
export const AUTOCOMPLETE_PRIMARY_TYPES: readonly string[] = [
  "university",
  "library",
  "cafe",
  "coffee_shop",
  "restaurant",
];

/** Metres per degree of latitude; longitude shrinks by cos(latitude). */
const METRES_PER_DEGREE = 111_320;

/**
 * The hard filter Autocomplete (New) gets. The JavaScript API only takes a
 * bounding box for `locationRestriction` (a circle is allowed for the soft
 * `locationBias` only), so this is the box around the campus circle. The
 * corners reach a little past the circle; resolvePlace() still checks the
 * true distance on the server.
 */
export function campusBounds(center = CAMPUS_CENTER, radius = CAMPUS_RADIUS_METERS) {
  const dLat = radius / METRES_PER_DEGREE;
  const dLng = radius / (METRES_PER_DEGREE * Math.cos((center.lat * Math.PI) / 180));
  return {
    north: center.lat + dLat,
    south: center.lat - dLat,
    east: center.lng + dLng,
    west: center.lng - dLng,
  };
}

export const AUTOCOMPLETE_RESTRICTION = campusBounds();

/** Fewest characters before the picker asks Google; keeps bills down and results relevant. */
export const MIN_QUERY_LENGTH = 2;

/** Milliseconds of quiet typing before a request goes out. */
export const SEARCH_DEBOUNCE_MS = 250;

/** The most rows the picker shows. */
export const MAX_SUGGESTIONS = 6;

/** Lower-case, accents dropped, punctuation collapsed to spaces. */
export function normaliseQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const FIXTURE_SECONDARY: Record<FixturePlace["kind"], string> = {
  "campus building": "Vanderbilt University",
  library: "Vanderbilt University",
  cafe: "Hillsboro Village, Nashville",
};

/** The fixture places as suggestions, with their fixture coordinates. */
export function fixtureSuggestions(): PlaceSuggestion[] {
  return FIXTURE_PLACES.map((place) => ({
    placeId: place.placeId,
    mainText: place.label,
    secondaryText: FIXTURE_SECONDARY[place.kind],
    location: FIXTURE_COORDINATES[place.placeId],
  }));
}

// Mirrors FIXTURE_LOCATIONS in fixtures.ts, keyed for the map marker.
const FIXTURE_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "ChIJ-FAKE-featheringill-hall": { lat: 36.1445, lng: -86.8035 },
  "ChIJ-FAKE-central-library": { lat: 36.1452, lng: -86.8006 },
  "ChIJ-FAKE-hillsboro-village-cafe": { lat: 36.1369, lng: -86.7998 },
};

/**
 * Fixture places matching `query`: every word typed must start some word of
 * the name, so "feath" and "hall feath" both find Featheringill Hall and an
 * empty query lists them all.
 */
export function matchFixturePlaces(query: string): PlaceSuggestion[] {
  const words = normaliseQuery(query).split(" ").filter(Boolean);
  return fixtureSuggestions()
    .filter((place) => {
      const nameWords = normaliseQuery(`${place.mainText} ${place.secondaryText}`).split(" ");
      return words.every((word) => nameWords.some((nameWord) => nameWord.startsWith(word)));
    })
    .slice(0, MAX_SUGGESTIONS);
}
