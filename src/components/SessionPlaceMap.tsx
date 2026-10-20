"use client";

/** The session page's map: where the session is, with the place name beneath. */

import { MapPanel } from "@/components/LocationMap";

export default function SessionPlaceMap({
  location,
  label,
}: {
  location: { lat: number; lng: number } | null;
  label: string;
}) {
  return <MapPanel pin={location} label={label} className="h-44" />;
}
