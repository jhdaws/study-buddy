"use client";

/**
 * The campus map, drawn with Leaflet over OpenStreetMap tiles -- the way
 * Pakita's host dashboard does it (moses-banda/pakita-framework,
 * apps/host/src/components/LocationMap.tsx). No API key and no bill.
 *
 * Shows campus, or one pin on a place. Display only: the pin cannot be
 * dragged, because the server saves only coordinates it knows itself
 * (src/lib/campus-places.ts), never ones a browser sends.
 *
 * Leaflet touches `window`, so it is imported inside the effect: nothing of
 * it runs during server rendering. Its stylesheet is imported in the root
 * layout.
 */

import { useEffect, useRef } from "react";

import { CAMPUS_CENTER } from "@/lib/env";

type LatLng = { lat: number; lng: number };

export const CAMPUS_ZOOM = 15;
export const PLACE_ZOOM = 17;

export default function CampusMap({
  pin,
  label,
}: {
  pin: LatLng | null;
  label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const marker = useRef<import("leaflet").Marker | null>(null);
  const leaflet = useRef<typeof import("leaflet") | null>(null);
  const latest = useRef({ pin, label });

  useEffect(() => {
    latest.current = { pin, label };
  });

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let resize: ReturnType<typeof setTimeout> | undefined;
    void import("leaflet").then((mod) => {
      if (cancelled || !box.current) return;
      // Leaflet is a CommonJS/UMD package: bundlers put it on `default`.
      const L = mod.default ?? mod;
      leaflet.current = L;
      const start = latest.current.pin;
      const m = L.map(box.current, {
        center: start
          ? [start.lat, start.lng]
          : [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
        zoom: start ? PLACE_ZOOM : CAMPUS_ZOOM,
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(m);
      map.current = m;
      placePin(L, m, marker, start, latest.current.label);
      // Often drawn inside a box still settling its size.
      resize = setTimeout(() => m.invalidateSize(), 60);
    });
    return () => {
      cancelled = true;
      clearTimeout(resize);
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, []);

  // Follow a new pick.
  const lat = pin?.lat;
  const lng = pin?.lng;
  useEffect(() => {
    const L = leaflet.current;
    const m = map.current;
    if (!L || !m) return;
    placePin(
      L,
      m,
      marker,
      lat === undefined || lng === undefined ? null : { lat, lng },
      label,
    );
  }, [lat, lng, label]);

  return (
    <div
      ref={box}
      className="h-full w-full bg-[#EEF1F4]"
      role="img"
      aria-label={label ? `Map showing ${label}` : "Map of campus"}
    />
  );
}

/** Replace the pin (or clear it) and frame the view around it. */
function placePin(
  L: typeof import("leaflet"),
  m: import("leaflet").Map,
  marker: { current: import("leaflet").Marker | null },
  at: LatLng | null,
  title?: string,
) {
  marker.current?.remove();
  marker.current = null;
  if (!at) {
    m.setView([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], CAMPUS_ZOOM);
    return;
  }
  const icon = L.divIcon({
    className: "campus-pin",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
  marker.current = L.marker([at.lat, at.lng], {
    icon,
    title,
    keyboard: false,
  }).addTo(m);
  m.setView([at.lat, at.lng], PLACE_ZOOM);
}
