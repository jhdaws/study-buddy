// Distance on the Earth's surface, and the campus-radius check built on it.
// Owner: Track M -- M3 (#24).
//
// Pure, and deliberately NOT server-only: resolvePlace() (src/lib/places.ts,
// server only) uses it to re-check a place Google returned, and Vitest can
// import it, which it cannot do with places.ts. M4's map may use it too.
//
// The picker restricts Autocomplete with the same CAMPUS_CENTER and
// CAMPUS_RADIUS_METERS, so the two agree on everything but a place within a
// few metres of the edge, where Google's geometry and ours may round
// differently. That is fine: this check is the one that counts.

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";

/** A point in degrees, the shape of CAMPUS_CENTER and of `locations` rows. */
export type LatLng = { lat: number; lng: number };

/** Mean radius of the Earth (IUGG), in metres. */
export const EARTH_RADIUS_METERS = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres (haversine formula).
 *
 * Treats the Earth as a sphere, which is off by well under 1% -- metres, at a
 * campus's scale. Longitudes either side of the antimeridian are handled by
 * the formula itself. A NaN or infinite coordinate gives NaN.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  // min() guards against h creeping past 1 by rounding, which would make
  // asin() return NaN for two nearly antipodal points.
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Whether a coordinate pair is real: finite, latitude within ±90, longitude within ±180. */
export function isValidLatLng(point: LatLng): boolean {
  return (
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180
  );
}

/**
 * Whether a point is within CAMPUS_RADIUS_METERS of CAMPUS_CENTER -- the
 * server's half of "The constraint that does not change" (data/README.md).
 * A point exactly on the radius counts as inside. An invalid point is outside:
 * this check fails closed.
 */
export function isWithinCampus(point: LatLng): boolean {
  return isValidLatLng(point) && distanceMeters(CAMPUS_CENTER, point) <= CAMPUS_RADIUS_METERS;
}
