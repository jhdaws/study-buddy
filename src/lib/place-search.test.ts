import { describe, expect, it } from "vitest";

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";
import { FIXTURE_PLACES } from "@/lib/fixtures";

import {
  AUTOCOMPLETE_PRIMARY_TYPES,
  AUTOCOMPLETE_RESTRICTION,
  fixtureSuggestions,
  matchFixturePlaces,
  normaliseQuery,
} from "./place-search";

describe("the Autocomplete request shape", () => {
  it("asks for at most five primary types, as Google allows", () => {
    expect(AUTOCOMPLETE_PRIMARY_TYPES.length).toBeLessThanOrEqual(5);
    expect(AUTOCOMPLETE_PRIMARY_TYPES).toContain("university");
    expect(AUTOCOMPLETE_PRIMARY_TYPES).toContain("library");
  });

  it("restricts to a box just enclosing the campus circle the server checks against", () => {
    const { north, south, east, west } = AUTOCOMPLETE_RESTRICTION;
    expect((north + south) / 2).toBeCloseTo(CAMPUS_CENTER.lat, 6);
    expect((east + west) / 2).toBeCloseTo(CAMPUS_CENTER.lng, 6);
    // Half-height in metres is the radius; half-width is wider at this latitude.
    expect(((north - south) / 2) * 111_320).toBeCloseTo(CAMPUS_RADIUS_METERS, 0);
    expect((east - west) / 2).toBeGreaterThan((north - south) / 2);
  });
});

describe("normaliseQuery", () => {
  it("drops case, accents and punctuation", () => {
    expect(normaliseQuery("  Café, Hillsboro! ")).toBe("cafe hillsboro");
  });
});

describe("matchFixturePlaces", () => {
  it("lists every fixture place for an empty query, each with coordinates", () => {
    const all = matchFixturePlaces("");
    expect(all.map((p) => p.placeId)).toEqual(FIXTURE_PLACES.map((p) => p.placeId));
    for (const place of all) expect(place.location).toBeDefined();
  });

  it("matches word prefixes in any order", () => {
    expect(matchFixturePlaces("feath").map((p) => p.mainText)).toEqual(["Featheringill Hall"]);
    expect(matchFixturePlaces("hall feath").map((p) => p.mainText)).toEqual(["Featheringill Hall"]);
    expect(matchFixturePlaces("cafe").map((p) => p.mainText)).toEqual(["Hillsboro Village café"]);
  });

  it("matches on the secondary text too", () => {
    expect(matchFixturePlaces("vanderbilt")).toHaveLength(2);
  });

  it("finds nothing for a word no place has", () => {
    expect(matchFixturePlaces("stadium")).toEqual([]);
  });

  it("keeps fixtureSuggestions in step with FIXTURE_PLACES", () => {
    expect(fixtureSuggestions().map((p) => p.mainText)).toEqual(FIXTURE_PLACES.map((p) => p.label));
  });
});
