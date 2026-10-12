import { describe, expect, it } from "vitest";

import { CAMPUS_CENTER } from "./env";
import {
  EXCLUDED_PLACE_TYPES,
  PLACE_ID_MAX_LENGTH,
  PUBLIC_PLACE_TYPES,
  classifyPlaceDetailsError,
  isWellFormedPlaceId,
  isWellFormedSessionToken,
  judgePlace,
  parseGoogleError,
  parsePlaceDetails,
} from "./place-policy";

// A real-looking id: the example in Google's place-id guide.
const GOOGLE_EXAMPLE_ID = "ChIJgUbEo8cfqokR5lP9_Wh_DaM";

const ON_CAMPUS = { latitude: CAMPUS_CENTER.lat, longitude: CAMPUS_CENTER.lng };
// Downtown Nashville, nearly 3 km from CAMPUS_CENTER.
const DOWNTOWN = { latitude: 36.1627, longitude: -86.7816 };

describe("isWellFormedPlaceId", () => {
  it("accepts ids shaped like Google's", () => {
    expect(isWellFormedPlaceId(GOOGLE_EXAMPLE_ID)).toBe(true);
    expect(isWellFormedPlaceId("ChIJ-FAKE-central-library")).toBe(true);
  });

  it("refuses the empty string", () => {
    expect(isWellFormedPlaceId("")).toBe(false);
  });

  it("refuses an overlong id", () => {
    expect(isWellFormedPlaceId("a".repeat(PLACE_ID_MAX_LENGTH))).toBe(true);
    expect(isWellFormedPlaceId("a".repeat(PLACE_ID_MAX_LENGTH + 1))).toBe(false);
  });

  it("refuses anything that could change the request path or query", () => {
    for (const id of [
      `places/${GOOGLE_EXAMPLE_ID}`,
      "../../v1/places:searchText",
      `${GOOGLE_EXAMPLE_ID}?fields=*`,
      `${GOOGLE_EXAMPLE_ID}#x`,
      `${GOOGLE_EXAMPLE_ID}%2F`,
      `${GOOGLE_EXAMPLE_ID} `,
      "ChİJ", // dotted capital I: a letter, but not ASCII
    ]) {
      expect(isWellFormedPlaceId(id), id).toBe(false);
    }
  });
});

describe("isWellFormedSessionToken", () => {
  it("accepts a version 4 UUID, as Google recommends", () => {
    expect(isWellFormedSessionToken("3f2b8c1e-9d4a-4b7e-8f6a-2c1d0e9b8a7f")).toBe(true);
  });

  it("refuses empty, longer than 36 characters, or not URL-safe base64", () => {
    expect(isWellFormedSessionToken("")).toBe(false);
    expect(isWellFormedSessionToken("a".repeat(37))).toBe(false);
    expect(isWellFormedSessionToken("abc/def")).toBe(false);
    expect(isWellFormedSessionToken("abc+def")).toBe(false);
  });
});

describe("parsePlaceDetails", () => {
  it("reads location and types", () => {
    expect(
      parsePlaceDetails({ location: ON_CAMPUS, types: ["library", "point_of_interest"] }),
    ).toEqual({
      location: CAMPUS_CENTER,
      types: ["library", "point_of_interest"],
    });
  });

  it("ignores fields it did not ask for", () => {
    expect(parsePlaceDetails({ location: ON_CAMPUS, types: ["cafe"], displayName: { text: "x" } }))
      .toEqual({ location: CAMPUS_CENTER, types: ["cafe"] });
  });

  it("returns null when there is no usable location", () => {
    for (const body of [
      null,
      "nope",
      [],
      {},
      { types: ["cafe"] },
      { location: null, types: ["cafe"] },
      { location: { latitude: "36.1", longitude: "-86.8" }, types: ["cafe"] },
      { location: { latitude: 36.1 }, types: ["cafe"] },
      { location: { latitude: 91, longitude: 0 }, types: ["cafe"] },
    ]) {
      expect(parsePlaceDetails(body), JSON.stringify(body)).toBeNull();
    }
  });

  it("turns missing or malformed types into an empty list", () => {
    expect(parsePlaceDetails({ location: ON_CAMPUS })?.types).toEqual([]);
    expect(parsePlaceDetails({ location: ON_CAMPUS, types: "cafe" })?.types).toEqual([]);
    expect(parsePlaceDetails({ location: ON_CAMPUS, types: ["cafe", 7, null] })?.types).toEqual([
      "cafe",
    ]);
  });
});

describe("judgePlace", () => {
  const place = (types: string[], location = ON_CAMPUS) => {
    const parsed = parsePlaceDetails({ location, types });
    if (!parsed) throw new Error("test place did not parse");
    return parsed;
  };

  it("accepts a public place on campus", () => {
    expect(judgePlace(place(["university", "point_of_interest", "establishment"]))).toBe("ok");
    expect(judgePlace(place(["cafe", "food", "establishment"]))).toBe("ok");
  });

  it("refuses a public place off campus", () => {
    expect(judgePlace(place(["library", "point_of_interest", "establishment"], DOWNTOWN))).toBe(
      "outside_campus",
    );
  });

  it("refuses residences, lodging and bare addresses, wherever they are", () => {
    for (const type of [
      "apartment_building",
      "housing_complex",
      "hotel",
      "lodging",
      "street_address",
      "premise",
      "subpremise",
    ]) {
      expect(judgePlace(place([type])), type).toBe("excluded_type");
      expect(judgePlace(place([type], DOWNTOWN)), type).toBe("excluded_type");
      // Still refused when Google also calls it an establishment.
      expect(judgePlace(place([type, "establishment"])), type).toBe("excluded_type");
    }
  });

  it("refuses a point on the map that is not a public place: plus codes, streets, corners", () => {
    for (const types of [
      ["plus_code"],
      ["route"],
      ["intersection"],
      ["street_number"],
      ["geocode"],
      ["neighborhood", "political"],
      ["postal_code"],
      ["natural_feature"],
      ["library"], // a type, but not marked as an establishment or point of interest
    ]) {
      expect(judgePlace(place(types)), types.join()).toBe("excluded_type");
    }
  });

  it("refuses a place with an excluded type even alongside an allowed one", () => {
    expect(judgePlace(place(["cafe", "hotel", "establishment"]))).toBe("excluded_type");
  });

  it("refuses a place with no types: it is not shown to be public", () => {
    expect(judgePlace(place([]))).toBe("excluded_type");
  });

  // A format check only: it catches a capital, a space or a hyphen, NOT a
  // misspelling like "apartmnet_building". Spelling is checked by review
  // against Google's place-type tables.
  it("lists only lowercase snake_case type names", () => {
    for (const type of [...EXCLUDED_PLACE_TYPES, ...PUBLIC_PLACE_TYPES]) {
      expect(type).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });
});

describe("parseGoogleError", () => {
  it("reads status, reason and message", () => {
    expect(
      parseGoogleError({
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
          details: [
            { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" },
          ],
        },
      }),
    ).toEqual({
      status: "INVALID_ARGUMENT",
      reason: "API_KEY_INVALID",
      message: "API key not valid. Please pass a valid API key.",
    });
  });

  it("returns nothing it cannot read, rather than throwing", () => {
    expect(parseGoogleError(null)).toEqual({});
    expect(parseGoogleError("<html>Bad Gateway</html>")).toEqual({});
    expect(parseGoogleError({ error: "boom" })).toEqual({});
    expect(parseGoogleError({ error: { status: 7, details: "x" } })).toEqual({
      status: undefined,
      reason: undefined,
      message: undefined,
    });
  });
});

describe("classifyPlaceDetailsError", () => {
  it("treats a missing or obsolete place as unknown", () => {
    expect(classifyPlaceDetailsError(404, { status: "NOT_FOUND" })).toBe("unknown_place");
    expect(classifyPlaceDetailsError(404, {})).toBe("unknown_place");
  });

  it("treats an id Google rejects as unknown", () => {
    expect(classifyPlaceDetailsError(400, { status: "INVALID_ARGUMENT" })).toBe("unknown_place");
  });

  it("treats a 400 whose body could not be read as a failed lookup, not an unknown place", () => {
    expect(classifyPlaceDetailsError(400, {})).toBe("lookup_failed");
    expect(classifyPlaceDetailsError(400, { status: "FAILED_PRECONDITION" })).toBe(
      "lookup_failed",
    );
  });

  it("treats a bad API key as our failure, not an unknown place", () => {
    expect(
      classifyPlaceDetailsError(400, { status: "INVALID_ARGUMENT", reason: "API_KEY_INVALID" }),
    ).toBe("lookup_failed");
  });

  it("treats auth, quota and server errors as a failed lookup", () => {
    expect(classifyPlaceDetailsError(401, { status: "UNAUTHENTICATED" })).toBe("lookup_failed");
    expect(classifyPlaceDetailsError(403, { status: "PERMISSION_DENIED" })).toBe("lookup_failed");
    expect(classifyPlaceDetailsError(429, { status: "RESOURCE_EXHAUSTED" })).toBe("lookup_failed");
    expect(classifyPlaceDetailsError(500, {})).toBe("lookup_failed");
    expect(classifyPlaceDetailsError(503, { status: "UNAVAILABLE" })).toBe("lookup_failed");
  });
});
