"use client";

/**
 * <MapPanel>: a framed campus map for anywhere a place is shown (the session
 * page today). M2, #23; 2026-10-20 it moved from Google to <CampusMap>
 * (Leaflet over OpenStreetMap, no key), matching the picker. An optional
 * caption strip at the bottom: pin, place name, "On campus".
 *
 * Display only -- maps submit nothing.
 */

import CampusMap from "@/components/CampusMap";
import Icon from "@/components/ui/Icon";

type LatLng = { lat: number; lng: number };

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
      <div className={`relative isolate ${className}`}>
        <CampusMap pin={pin} label={label} />
      </div>
      {caption && label && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2.5 text-sm">
          <span className="text-ink-2">
            <Icon name="pin" />
          </span>
          <span className="truncate font-semibold text-ink">{label}</span>
          <span className="shrink-0 text-xs text-ink-2">On campus</span>
        </div>
      )}
    </div>
  );
}
