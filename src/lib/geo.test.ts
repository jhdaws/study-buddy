import { describe, expect, it } from "vitest";

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "./env";
import { EARTH_RADIUS_METERS, distanceMeters, isWithinCampus } from "./geo";

/** The point `meters` due north of `from`: a meridian arc, exact on a sphere. */
function northOf(from: { lat: number; lng: number }, meters: number) {
  return { lat: from.lat + (meters / EARTH_RADIUS_METERS) * (180 / Math.PI), lng: from.lng };
}

describe("distanceMeters", () => {
  it("is zero from a point to itself", () => {
    expect(distanceMeters(CAMPUS_CENTER, CAMPUS_CENTER)).toBe(0);
  });

  it("matches a published value: Nashville (BNA) to Los Angeles (LAX)", () => {
    // Rosetta Code's haversine task gives 2887.2599506071106 km for these two
    // points with a 6372.8 km radius. Distance scales with the radius, so with
    // ours it is that value times 6371 / 6372.8.
    const bna = { lat: 36.12, lng: -86.67 };
    const lax = { lat: 33.94, lng: -118.4 };
    const expected = (2887.2599506071106 * 1000 * 6371) / 6372.8;

    expect(distanceMeters(bna, lax)).toBeCloseTo(expected, 0);
    expect(distanceMeters(lax, bna)).toBeCloseTo(expected, 0);
  });

  it("measures one degree of longitude on the equator as 1/360 of the circumference", () => {
    const expected = (2 * Math.PI * EARTH_RADIUS_METERS) / 360; // ≈ 111,195 m

    expect(distanceMeters({ lat: 0, lng: 10 }, { lat: 0, lng: 11 })).toBeCloseTo(expected, 3);
  });

  it("takes the short way across the antimeridian", () => {
    const expected = (2 * Math.PI * EARTH_RADIUS_METERS) / 360;

    expect(distanceMeters({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(
      expected,
      3,
    );
  });

  it("gives NaN, not a number that looks real, for a NaN coordinate", () => {
    expect(distanceMeters(CAMPUS_CENTER, { lat: Number.NaN, lng: 0 })).toBeNaN();
  });
});

describe("isWithinCampus", () => {
  it("accepts the centre itself", () => {
    expect(isWithinCampus(CAMPUS_CENTER)).toBe(true);
  });

  it("accepts a point just inside the radius", () => {
    expect(isWithinCampus(northOf(CAMPUS_CENTER, CAMPUS_RADIUS_METERS - 1))).toBe(true);
  });

  it("refuses a point just outside the radius", () => {
    expect(isWithinCampus(northOf(CAMPUS_CENTER, CAMPUS_RADIUS_METERS + 1))).toBe(false);
  });

  it("refuses somewhere across town -- downtown Nashville, nearly 3 km away", () => {
    expect(isWithinCampus({ lat: 36.1627, lng: -86.7816 })).toBe(false);
  });

  it("fails closed on coordinates that are not real", () => {
    expect(isWithinCampus({ lat: Number.NaN, lng: CAMPUS_CENTER.lng })).toBe(false);
    expect(isWithinCampus({ lat: CAMPUS_CENTER.lat, lng: Number.POSITIVE_INFINITY })).toBe(false);
    // Latitude 216.1447 does not exist. Refused by the range check, not left
    // to whatever the formula makes of it.
    expect(isWithinCampus({ lat: CAMPUS_CENTER.lat + 180, lng: CAMPUS_CENTER.lng })).toBe(false);
  });
});
