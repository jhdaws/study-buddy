import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";
import { EXCLUDED_PLACE_TYPES, isWellFormedSessionToken } from "@/lib/place-policy";

import {
  AUTOCOMPLETE_PRIMARY_TYPES,
  AUTOCOMPLETE_URL,
  autocompleteRequestBody,
  fetchPlaceLocation,
  MAX_SUGGESTIONS,
  newSessionToken,
  parseAutocompleteResponse,
  PlaceSearchError,
  searchPlaces,
} from "./place-search";

// The picker's Google calls (M2), with fetch stubbed: no test reaches Google.
// The reply shapes are trimmed from real Autocomplete (New) and Place
// Details (New) answers for Featheringill Hall, 2026-11-09.

const FEATHERINGILL_ID = "ChIJQVdfNb1mZIgRoCFoSaNt4Do";

function prediction(placeId: string, main: string, secondary?: string) {
  return {
    placePrediction: {
      placeId,
      text: { text: secondary ? `${main}, ${secondary}` : main },
      structuredFormat: {
        mainText: { text: main, matches: [{ endOffset: 5 }] },
        ...(secondary ? { secondaryText: { text: secondary } } : {}),
      },
    },
  };
}

const fetchMock = vi.fn();

function googleReplies(status: number, body: unknown) {
  fetchMock.mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("the Autocomplete request", () => {
  it("restricts to the same circle resolvePlace() checks, as a hard filter", () => {
    const body = autocompleteRequestBody("Feath", "token-1");
    expect(body.locationRestriction).toEqual({
      circle: {
        center: { latitude: CAMPUS_CENTER.lat, longitude: CAMPUS_CENTER.lng },
        radius: CAMPUS_RADIUS_METERS,
      },
    });
    expect(body).not.toHaveProperty("locationBias");
    expect(body).toMatchObject({ input: "Feath", sessionToken: "token-1" });
  });

  it("asks for at most five primary types, campus buildings, libraries and cafés among them", () => {
    const { includedPrimaryTypes } = autocompleteRequestBody("x", "t");
    expect(includedPrimaryTypes.length).toBeLessThanOrEqual(5);
    expect(includedPrimaryTypes).toEqual([...AUTOCOMPLETE_PRIMARY_TYPES]);
    for (const type of ["university", "library", "cafe"]) {
      expect(includedPrimaryTypes).toContain(type);
    }
  });

  it("never asks for a type the server would refuse", () => {
    for (const type of AUTOCOMPLETE_PRIMARY_TYPES) {
      expect(EXCLUDED_PLACE_TYPES.has(type)).toBe(false);
    }
  });
});

describe("newSessionToken", () => {
  it("is a fresh UUID v4 each time, which the server will pass on to Google", () => {
    const first = newSessionToken();
    const second = newSessionToken();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
    expect(isWellFormedSessionToken(first)).toBe(true);
  });
});

describe("parseAutocompleteResponse", () => {
  it("reads each place prediction's id, name and address", () => {
    const body = {
      suggestions: [
        prediction(FEATHERINGILL_ID, "Featheringill Hall", "24th Avenue South, Nashville, TN, USA"),
      ],
    };
    expect(parseAutocompleteResponse(body)).toEqual([
      {
        placeId: FEATHERINGILL_ID,
        mainText: "Featheringill Hall",
        secondaryText: "24th Avenue South, Nashville, TN, USA",
      },
    ]);
  });

  it("falls back to the full text when there is no structured name, and to no address", () => {
    const body = {
      suggestions: [
        { placePrediction: { placeId: "ChIJ-one", text: { text: "Central Library" } } },
        prediction("ChIJ-two", "Stevenson Center Complex"),
      ],
    };
    expect(parseAutocompleteResponse(body)).toEqual([
      { placeId: "ChIJ-one", mainText: "Central Library", secondaryText: "" },
      { placeId: "ChIJ-two", mainText: "Stevenson Center Complex", secondaryText: "" },
    ]);
  });

  it("drops query predictions, malformed ids, nameless places and repeats", () => {
    const body = {
      suggestions: [
        { queryPrediction: { text: { text: "library near me" } } },
        prediction("../../etc/passwd", "Not a place id"),
        prediction("places/ChIJabc", "A resource name, not an id"),
        { placePrediction: { placeId: 42, text: { text: "Numeric id" } } },
        { placePrediction: { placeId: "ChIJ-nameless", text: { text: "   " } } },
        null,
        "nonsense",
        prediction(FEATHERINGILL_ID, "Featheringill Hall"),
        prediction(FEATHERINGILL_ID, "Featheringill Hall again"),
      ],
    };
    expect(parseAutocompleteResponse(body).map((s) => s.placeId)).toEqual([FEATHERINGILL_ID]);
  });

  it(`keeps at most ${MAX_SUGGESTIONS}`, () => {
    const body = {
      suggestions: Array.from({ length: 8 }, (_, i) => prediction(`ChIJ-${i}`, `Place ${i}`)),
    };
    expect(parseAutocompleteResponse(body)).toHaveLength(MAX_SUGGESTIONS);
  });

  it.each([null, undefined, "text", [], {}, { suggestions: "no" }])(
    "reads %j as no suggestions",
    (body) => {
      expect(parseAutocompleteResponse(body)).toEqual([]);
    },
  );
});

describe("searchPlaces", () => {
  it("posts the request with the browser key and a field mask, and parses the reply", async () => {
    googleReplies(200, { suggestions: [prediction(FEATHERINGILL_ID, "Featheringill Hall")] });
    const signal = new AbortController().signal;

    const found = await searchPlaces("Feath", { apiKey: "browser-key", sessionToken: "token-1", signal });

    expect(found.map((s) => s.mainText)).toEqual(["Featheringill Hall"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(AUTOCOMPLETE_URL);
    expect(init.method).toBe("POST");
    expect(init.signal).toBe(signal);
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-Goog-Api-Key": "browser-key",
    });
    expect(init.headers["X-Goog-FieldMask"]).toContain("suggestions.placePrediction.placeId");
    expect(JSON.parse(init.body)).toEqual(autocompleteRequestBody("Feath", "token-1"));
  });

  it("throws a PlaceSearchError carrying only the HTTP status when Google refuses", async () => {
    googleReplies(403, {
      error: { status: "PERMISSION_DENIED", message: "Requests from referer are blocked." },
    });
    const error = await searchPlaces("Feath", { apiKey: "k", sessionToken: "t" }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(PlaceSearchError);
    expect((error as PlaceSearchError).status).toBe(403);
    expect((error as Error).message).not.toMatch(/referer/);
  });

  it("lets a network failure or an abort through for the caller", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(searchPlaces("Feath", { apiKey: "k", sessionToken: "t" })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

describe("fetchPlaceLocation (the map's pin)", () => {
  it("asks Place Details for the location only, without the session token", async () => {
    googleReplies(200, { location: { latitude: 36.1445184, longitude: -86.8036674 } });

    await expect(fetchPlaceLocation(FEATHERINGILL_ID, { apiKey: "browser-key" })).resolves.toEqual({
      lat: 36.1445184,
      lng: -86.8036674,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://places.googleapis.com/v1/places/${FEATHERINGILL_ID}`);
    expect(String(url)).not.toContain("sessionToken");
    expect(init.headers).toEqual({ "X-Goog-Api-Key": "browser-key", "X-Goog-FieldMask": "location" });
  });

  it("never sends a malformed id to Google", async () => {
    await expect(fetchPlaceLocation("../../etc/passwd", { apiKey: "k" })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gives no pin for an error, a reply without a usable location, or a body that is not JSON", async () => {
    googleReplies(404, { error: { status: "NOT_FOUND" } });
    await expect(fetchPlaceLocation(FEATHERINGILL_ID, { apiKey: "k" })).resolves.toBeNull();

    googleReplies(200, { location: { latitude: "36.1", longitude: -86.8 } });
    await expect(fetchPlaceLocation(FEATHERINGILL_ID, { apiKey: "k" })).resolves.toBeNull();

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    await expect(fetchPlaceLocation(FEATHERINGILL_ID, { apiKey: "k" })).resolves.toBeNull();
  });
});
