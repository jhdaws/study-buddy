"use client";

/**
 * Map of open sessions (US-03, M4 #25): the map half of /sessions' List / Map
 * toggle. <SessionBrowser> loads this file with next/dynamic (ssr: false),
 * and only once the map view is shown, so neither this code nor Google's
 * script is part of the list's first load. It never renders without a key:
 * the browser checks for one first and shows <MapUnavailable> instead.
 *
 * What it draws comes from sessionPins() (src/lib/session-map.ts, unit
 * tested): one pin per PLACE, because sessions at the same `locations` row
 * share exact coordinates and separate markers would hide each other. A
 * place with one session is one marker for that session. Pins sit at the
 * coordinates resolvePlace() validated and stored -- Google's, never the
 * host's -- and the sessions are whatever the browser's filters left, so the
 * map and the list always show the same set.
 *
 * - A full pin is hollow, grey and dashed; one with seats is solid blue. Not
 *   colour alone: the outline differs too, and every marker's accessible
 *   name says "Full" or how many seats are left. Open pins draw above full
 *   ones.
 * - Markers are Advanced Markers with a click handler, which Google makes
 *   focusable: Tab reaches each one, and Enter or Space opens it like a tap.
 *   Each is 44 by 54 px (ADR 0004's tap target).
 * - The info window lists the place's sessions -- course, topic, campus
 *   time, seats left -- each with a link to /sessions/[id].
 * - If Google refuses the key (gm_authFailure: wrong referrer, API off,
 *   billing) or the script fails to load, this swaps itself for
 *   <MapUnavailable>: never Google's grey error box, never its text.
 *
 * Map ID: NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID, else Google's DEMO_MAP_ID
 * (googleMapsMapId(), src/lib/env.ts). Advanced Markers need one.
 */

import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
} from "@vis.gl/react-google-maps";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import MapUnavailable from "@/components/MapUnavailable";
import { SeatsLabel } from "@/components/SessionCard";
import { LINK, MAP_HEIGHT, PANEL } from "@/components/ui/styles";
import { CAMPUS_CENTER, googleMapsMapId } from "@/lib/env";
import { sessionPins, type SessionPin } from "@/lib/session-map";
import type { SessionListItem } from "@/lib/sessions";

declare global {
  interface Window {
    /** The Maps JavaScript API calls this when it refuses the key. */
    gm_authFailure?: () => void;
  }
}

/** Shows campus and the blocks around it on a phone. */
const CAMPUS_ZOOM = 15;

export type SessionMapProps = {
  /** Already filtered by the browser's search and chips. */
  sessions: SessionListItem[];
  /** The request's "now", for "Today" and "Tomorrow". */
  now: Date;
  /** The browser key. The caller has already checked there is one. */
  apiKey: string;
  /** Switches back to the list, offered if the map fails. */
  onShowList?: () => void;
};

export default function SessionMap({ sessions, now, apiKey, onShowList }: SessionMapProps) {
  const pins = useMemo(() => sessionPins(sessions, now), [sessions, now]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // A global, because that is the only way Google reports a refused key;
    // chain to whatever was there and put it back on the way out.
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      setFailed(true);
      previous?.();
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }, []);

  if (failed) {
    return <MapUnavailable reason="load_failed" onShowList={onShowList} />;
  }

  return (
    <section aria-label="Map of study sessions" className={`${PANEL} overflow-hidden`}>
      <APIProvider apiKey={apiKey} onError={() => setFailed(true)}>
        <div className={`${MAP_HEIGHT} w-full`}>
          <GoogleMap
            mapId={googleMapsMapId()}
            defaultCenter={CAMPUS_CENTER}
            defaultZoom={CAMPUS_ZOOM}
            disableDefaultUI
            zoomControl
            // Google's own places would open Google's own info windows.
            clickableIcons={false}
            onClick={() => setOpenKey(null)}
            className="size-full"
          >
            {pins.map((pin) => (
              <PinMarker
                key={pin.key}
                pin={pin}
                open={pin.key === openKey}
                onOpen={() => setOpenKey(pin.key)}
                // Only if it is still this pin's: opening another pin unmounts
                // this one's window, which may report a close of its own.
                onClose={() => setOpenKey((key) => (key === pin.key ? null : key))}
              />
            ))}
          </GoogleMap>
        </div>
      </APIProvider>
      <Legend />
    </section>
  );
}

function PinMarker({
  pin,
  open,
  onOpen,
  onClose,
}: {
  pin: SessionPin;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={pin.position}
        title={pin.title}
        onClick={onOpen}
        zIndex={pin.full ? 1 : 2}
      >
        <PinShape full={pin.full} count={pin.sessions.length} />
      </AdvancedMarker>
      {open && (
        <InfoWindow
          anchor={marker}
          onClose={onClose}
          headerContent={<PinHeading pin={pin} />}
          maxWidth={300}
        >
          <PinSessions pin={pin} />
        </InfoWindow>
      )}
    </>
  );
}

/**
 * The marker: a 44 x 54 pin. Solid blue with seats, hollow and dashed when
 * full. Shows how many sessions share it when more than one does.
 */
function PinShape({ full, count, small = false }: { full: boolean; count: number; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 44 54"
      width={small ? 15 : 44}
      height={small ? 18 : 54}
      aria-hidden="true"
      focusable="false"
      data-full={full || undefined}
      className="block font-sans drop-shadow-sm"
    >
      <path
        d="M22 52C14 42 4 32.5 4 22a18 18 0 0 1 36 0c0 10.5-10 20-18 30Z"
        fill={full ? "#ffffff" : "var(--color-signal)"}
        stroke={full ? "var(--color-field)" : "#ffffff"}
        strokeWidth={small ? 5 : 2.5}
        strokeDasharray={full && !small ? "4 3" : undefined}
      />
      {count > 1 ? (
        <text
          x="22"
          y="23"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="17"
          fontWeight="700"
          fill={full ? "var(--color-ink-2)" : "#ffffff"}
        >
          {count}
        </text>
      ) : (
        <circle cx="22" cy="22" r="6" fill={full ? "var(--color-field)" : "#ffffff"} />
      )}
    </svg>
  );
}

function PinHeading({ pin }: { pin: SessionPin }) {
  return (
    <div className="font-sans">
      <h3 className="text-[15px] leading-snug font-bold text-ink">{pin.label}</h3>
      {pin.sessions.length > 1 && (
        <p className="text-sm text-ink-2">{pin.sessions.length} sessions here</p>
      )}
    </div>
  );
}

function PinSessions({ pin }: { pin: SessionPin }) {
  return (
    <ul className="flex w-64 max-w-full flex-col divide-y divide-line font-sans">
      {pin.sessions.map((session) => (
        <li key={session.id} className="py-2.5 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-[15px] font-bold text-ink">{session.courseCode}</p>
            <SeatsLabel seatsLeft={session.seatsLeft} />
          </div>
          {session.courseTitle && <p className="text-sm text-ink-2">{session.courseTitle}</p>}
          <p className="mt-1 text-[15px] leading-snug text-ink">{session.topic}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            <time dateTime={session.startsAt}>{session.time}</time>
          </p>
          {session.where && <p className="text-sm text-ink-2">{session.where}</p>}
          {/* The app's 3px focus offset is clipped by the info window's own scroller. */}
          <Link href={session.href} className={`${LINK} focus-visible:outline-offset-0`}>
            View session
            <span className="sr-only">
              : {session.courseCode}, {session.topic}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-sm text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <PinShape full={false} count={1} small />
        Seats left
      </span>
      <span className="inline-flex items-center gap-1.5">
        <PinShape full count={1} small />
        Full
      </span>
      <span>Tap a pin for times and seats.</span>
    </p>
  );
}
