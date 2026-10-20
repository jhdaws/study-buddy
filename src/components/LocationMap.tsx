"use client";

/**
 * The campus map under the location picker (M2, #23): Google's basemap
 * centred on campus, with one pin on the chosen place. Display only -- it
 * submits nothing, and the picker works without it.
 *
 * Only rendered inside LocationPicker's <APIProvider>, so it never loads
 * Google itself. Advanced markers need a Map ID; NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
 * is M1's, and Google's DEMO_MAP_ID works until then (it shows a watermark).
 */

import { AdvancedMarker, Map, Pin } from "@vis.gl/react-google-maps";

import { CAMPUS_CENTER } from "@/lib/env";

export const DEFAULT_ZOOM = 15;
export const PLACE_ZOOM = 17;

export type LocationMapProps = {
  /** The chosen place's coordinates, or null for the plain campus view. */
  pin: { lat: number; lng: number } | null;
  /** Its name, for the marker's accessible title. */
  title?: string;
};

export default function LocationMap({ pin, title }: LocationMapProps) {
  return (
    <Map
      mapId={process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"}
      // `center`/`zoom` (not default*) so a new selection moves the map.
      center={pin ?? CAMPUS_CENTER}
      zoom={pin ? PLACE_ZOOM : DEFAULT_ZOOM}
      gestureHandling="cooperative"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      className="h-full w-full"
    >
      {pin && (
        <AdvancedMarker position={pin} title={title}>
          <Pin background="#13294b" borderColor="#0e1b33" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}
    </Map>
  );
}
