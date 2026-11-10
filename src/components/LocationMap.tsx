"use client";

/**
 * The small map under the location picker (M2, #23): Google's basemap with
 * one pin on the chosen place, so the host can see it is the right building.
 * Display only -- it submits nothing, and the picker works without it. The
 * server never sees these coordinates; resolvePlace() looks the place up
 * itself.
 *
 * Loaded lazily by PlacesPicker, and only once a place is chosen and its
 * coordinates are known, so the Maps JavaScript API (and its map-load
 * billing) costs nothing for a host who never picks one. It brings its own
 * <APIProvider>.
 *
 * Advanced markers need a Map ID: NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID (M1).
 * Without one it falls back to Google's DEMO_MAP_ID, which works but is meant
 * for development only.
 *
 * The map hides while the host searches again, and every new instance is a
 * billed map load, so `reuseMaps` keeps Google's map instance across those
 * remounts and Recenter pans it to the new place.
 */

import { AdvancedMarker, APIProvider, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";

import type { LatLng } from "@/lib/geo";

/** Close enough to tell neighbouring buildings apart. */
export const PLACE_ZOOM = 17;

export type LocationMapProps = {
  /** NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. */
  apiKey: string;
  /** The chosen place's coordinates. */
  pin: LatLng;
  /** Its name, for the marker's accessible title. */
  title: string;
};

export default function LocationMap({ apiKey, pin, title }: LocationMapProps) {
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
        defaultCenter={pin}
        defaultZoom={PLACE_ZOOM}
        reuseMaps
        // One finger scrolls the page past the map on a phone; two move it.
        gestureHandling="cooperative"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="h-full w-full"
      >
        <Recenter pin={pin} />
        <AdvancedMarker position={pin} title={title}>
          <Pin background="#13294b" borderColor="#0e1b33" glyphColor="#ffffff" />
        </AdvancedMarker>
      </Map>
    </APIProvider>
  );
}

/** Pans a reused map to the newly chosen place (defaultCenter applies only to a new one). */
function Recenter({ pin }: { pin: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map?.panTo(pin);
    map?.setZoom(PLACE_ZOOM);
  }, [map, pin]);
  return null;
}
