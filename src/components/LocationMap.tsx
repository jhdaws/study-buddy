"use client";

/**
 * Campus maps (M2, #23; 2026-10-20 redesign).
 *
 *   <LocationMap>  Google's basemap centred on campus with one pin. Must be
 *                  inside an <APIProvider> (LocationPicker's, or MapPanel's).
 *   <MapPanel>     A framed map for anywhere: Google's when the browser key
 *                  exists (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, M1), otherwise a
 *                  plain campus grid that says the map turns on once Google
 *                  is connected. Either way, an optional caption strip at the
 *                  bottom: pin, place name, "On campus".
 *
 * Display only -- maps submit nothing. Advanced markers need a Map ID:
 * NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID (M1), else Google's DEMO_MAP_ID, which shows
 * a watermark.
 */

import { AdvancedMarker, APIProvider, Map, Pin } from "@vis.gl/react-google-maps";

import Icon from "@/components/ui/Icon";
import { CAMPUS_CENTER } from "@/lib/env";

export const DEFAULT_ZOOM = 15;
export const PLACE_ZOOM = 17;

type LatLng = { lat: number; lng: number };

// NEXT_PUBLIC_ values are inlined at build time: a constant per build.
const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export function hasGoogleMaps(): boolean {
  return Boolean(BROWSER_KEY);
}

export default function LocationMap({ pin, title }: { pin: LatLng | null; title?: string }) {
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
          <Pin background="#111827" borderColor="#111827" glyphColor="#ffffff" />
        </AdvancedMarker>
      )}
    </Map>
  );
}

/** The plain stand-in when there is no Google key: a faint grid and the pin. */
export function MapPlaceholder({ pin, label }: { pin: LatLng | null; label?: string }) {
  // Rough campus box for the pin: about 1.5 km around CAMPUS_CENTER.
  const x = pin ? 50 + ((pin.lng - CAMPUS_CENTER.lng) / 0.017) * 50 : null;
  const y = pin ? 50 - ((pin.lat - CAMPUS_CENTER.lat) / 0.0135) * 50 : null;
  return (
    <div
      aria-hidden
      className="relative h-full w-full bg-[#EEF1F4]"
      style={{
        backgroundImage: "repeating-linear-gradient(135deg, rgba(17,24,39,0.045) 0 1px, transparent 1px 10px)",
      }}
    >
      {pin && x !== null && y !== null ? (
        <span
          className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
          style={{ left: `${Math.min(90, Math.max(10, x))}%`, top: `${Math.min(78, Math.max(30, y))}%` }}
          title={label}
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-dark text-white shadow-[0_4px_12px_rgba(17,24,39,0.3)]">
            <Icon name="pin" size={14} />
          </span>
          <span className="h-2 w-0.5 bg-dark" />
        </span>
      ) : (
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border border-line bg-white px-2.5 py-1 text-xs text-ink-2">
          Vanderbilt University
        </span>
      )}
    </div>
  );
}

/** A framed campus map with an optional caption strip under it. */
export function MapPanel({
  pin,
  label,
  className = "h-40",
  caption = true,
}: {
  pin: LatLng | null;
  label?: string;
  className?: string;
  caption?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className={`relative ${className}`}>
        {BROWSER_KEY ? (
          <APIProvider apiKey={BROWSER_KEY} libraries={["marker"]}>
            <LocationMap pin={pin} title={label} />
          </APIProvider>
        ) : (
          <MapPlaceholder pin={pin} label={label} />
        )}
      </div>
      {caption && label && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-sm">
          <span className="text-ink-2">
            <Icon name="pin" />
          </span>
          <span className="truncate font-semibold text-ink">{label}</span>
          <span className="shrink-0 text-xs text-ink-2">On campus</span>
          {!BROWSER_KEY && <span className="ml-auto hidden shrink-0 text-xs text-ink-3 sm:inline">Map turns on once Google Maps is connected</span>}
        </div>
      )}
    </div>
  );
}
