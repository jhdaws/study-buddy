import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAMPUS_CENTER, DEMO_MAP_ID } from "@/lib/env";
import { mapUnavailableMessage } from "@/lib/errors";
import type { SessionListItem } from "@/lib/sessions";

import SessionMap from "./SessionMap";

// A stand-in for @vis.gl/react-google-maps: plain DOM in place of Google, so
// what is tested is this component's wiring -- which pins, named how, opening
// what -- not Google's rendering. Markers are buttons because that is what
// Google makes a clickable Advanced Marker: focusable, named by its `title`,
// activated by Enter or Space. A marker or info-window click does not reach
// the map's own onClick, as on the real map; only "map background" does.
const google = vi.hoisted(() => ({
  apiKey: null as string | null,
  onError: null as ((error: unknown) => void) | null,
}));

vi.mock("@vis.gl/react-google-maps", () => ({
  APIProvider: ({
    apiKey,
    onError,
    children,
  }: {
    apiKey: string;
    onError?: (error: unknown) => void;
    children: ReactNode;
  }) => {
    google.apiKey = apiKey;
    google.onError = onError ?? null;
    return <>{children}</>;
  },
  Map: ({
    mapId,
    defaultCenter,
    defaultZoom,
    onClick,
    children,
  }: {
    mapId: string;
    defaultCenter: { lat: number; lng: number };
    defaultZoom: number;
    onClick?: () => void;
    children: ReactNode;
  }) => (
    <div
      data-testid="google-map"
      data-map-id={mapId}
      data-center={JSON.stringify(defaultCenter)}
      data-zoom={defaultZoom}
    >
      <button type="button" onClick={() => onClick?.()}>
        map background
      </button>
      {children}
    </div>
  ),
  AdvancedMarker: forwardRef<
    HTMLButtonElement,
    {
      title: string;
      position: { lat: number; lng: number };
      zIndex: number;
      onClick: () => void;
      children: ReactNode;
    }
  >(function AdvancedMarker({ title, position, zIndex, onClick, children }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={title}
        data-marker
        data-position={`${position.lat},${position.lng}`}
        data-z-index={zIndex}
        onClick={onClick}
      >
        {children}
      </button>
    );
  }),
  InfoWindow: ({
    headerContent,
    onClose,
    children,
  }: {
    headerContent: ReactNode;
    onClose: () => void;
    children: ReactNode;
  }) => (
    <div role="dialog">
      {headerContent}
      {children}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
  useAdvancedMarkerRef: () => [() => {}, null],
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.gm_authFailure;
});

// Thursday 1 Oct 2026, 10 AM in Nashville.
const now = new Date("2026-10-01T15:00:00Z");
const FEATHERINGILL = { lat: 36.1445, lng: -86.8035 };
const LIBRARY = { lat: 36.1452, lng: -86.8006 };

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Design patterns review",
    locationLabel: "Featheringill Hall",
    room: "2nd floor study area",
    ...FEATHERINGILL,
    startsAt: "2026-10-01T19:00:00.000Z",
    endsAt: "2026-10-01T21:00:00.000Z",
    capacity: 4,
    attendeeCount: 2,
    seatsLeft: 2,
    hostDisplayName: "Priya",
    ...overrides,
  };
}

const cs3251 = session();
const cs4278 = session({
  id: "30000000-0000-4000-8000-000000000004",
  course: { departmentCode: "CS", number: "4278", title: "Principles of Software Engineering" },
  topic: "Sprint demo prep",
  room: "Room 100",
  startsAt: "2026-10-03T19:00:00.000Z",
  endsAt: "2026-10-03T21:00:00.000Z",
});
const mathFull = session({
  id: "30000000-0000-4000-8000-000000000002",
  course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
  topic: "Exam 2 practice problems",
  locationLabel: "Central Library",
  room: "Group study room 3",
  ...LIBRARY,
  capacity: 3,
  attendeeCount: 3,
  seatsLeft: 0,
});

const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();
const marker = (name: string) => screen.getByRole("button", { name });

function renderMap(sessions: SessionListItem[] = [cs3251, mathFull], onShowList = vi.fn()) {
  render(<SessionMap sessions={sessions} now={now} apiKey="test-browser-key" onShowList={onShowList} />);
  return onShowList;
}

describe("<SessionMap>", () => {
  it("loads Google with the key it was given, centred on campus", () => {
    renderMap();

    const map = screen.getByTestId("google-map");
    expect(google.apiKey).toBe("test-browser-key");
    expect(JSON.parse(map.getAttribute("data-center") ?? "null")).toEqual(CAMPUS_CENTER);
    expect(screen.getByRole("region", { name: "Map of study sessions" })).toBeTruthy();
  });

  it("uses the configured map ID, or Google's demo one without", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    renderMap();
    expect(screen.getByTestId("google-map").getAttribute("data-map-id")).toBe(DEMO_MAP_ID);
    cleanup();

    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "test-map-id");
    renderMap();
    expect(screen.getByTestId("google-map").getAttribute("data-map-id")).toBe("test-map-id");
  });

  it("puts one marker per place, at the stored coordinates, named for screen readers", () => {
    renderMap([cs3251, mathFull, cs4278]);

    const markers = document.querySelectorAll("[data-marker]");
    expect(markers).toHaveLength(2);
    expect(marker("2 sessions at Featheringill Hall").getAttribute("data-position")).toBe(
      `${FEATHERINGILL.lat},${FEATHERINGILL.lng}`,
    );
    expect(marker("MATH 2410 at Central Library, Full").getAttribute("data-position")).toBe(
      `${LIBRARY.lat},${LIBRARY.lng}`,
    );
  });

  it("draws a full session's marker differently, and beneath open ones", () => {
    renderMap();

    const open = marker("CS 3251 at Featheringill Hall, 2 seats left");
    const full = marker("MATH 2410 at Central Library, Full");
    expect(open.querySelector("svg")?.hasAttribute("data-full")).toBe(false);
    expect(full.querySelector("svg")?.getAttribute("data-full")).toBe("true");
    expect(Number(full.getAttribute("data-z-index"))).toBeLessThan(
      Number(open.getAttribute("data-z-index")),
    );
  });

  it("shows nothing until a marker is tapped", () => {
    renderMap();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tapping a marker shows the course, campus time, seats left and a link through", () => {
    renderMap();
    fireEvent.click(marker("CS 3251 at Featheringill Hall, 2 seats left"));

    const info = screen.getByRole("dialog");
    expect(within(info).getByRole("heading", { name: "Featheringill Hall" })).toBeTruthy();
    expect(within(info).getByText("CS 3251")).toBeTruthy();
    expect(within(info).getByText("Intermediate Software Design")).toBeTruthy();
    expect(within(info).getByText("Design patterns review")).toBeTruthy();
    // 19:00 UTC is 2 PM on campus, whatever this machine's zone.
    expect(plain(info.querySelector("time")?.textContent ?? null)).toBe("Today · 2:00 – 4:00 PM");
    expect(info.querySelector("time")?.getAttribute("dateTime")).toBe(cs3251.startsAt);
    expect(within(info).getByText("2 seats left")).toBeTruthy();
    expect(within(info).getByText("2nd floor study area")).toBeTruthy();

    const link = within(info).getByRole("link", { name: "View session: CS 3251, Design patterns review" });
    expect(link.getAttribute("href")).toBe(`/sessions/${cs3251.id}`);
    expect(link.className).toContain("min-h-11");
  });

  it("lists every session at a shared place, each with its own link", () => {
    renderMap([cs3251, cs4278]);
    fireEvent.click(marker("2 sessions at Featheringill Hall"));

    const info = screen.getByRole("dialog");
    expect(within(info).getByText("2 sessions here")).toBeTruthy();
    expect(within(info).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      `/sessions/${cs3251.id}`,
      `/sessions/${cs4278.id}`,
    ]);
  });

  it("says Full in a full session's info window", () => {
    renderMap();
    fireEvent.click(marker("MATH 2410 at Central Library, Full"));

    expect(within(screen.getByRole("dialog")).getByText("Full")).toBeTruthy();
  });

  it("keeps one info window open at a time, and closes it from its button or the map", () => {
    renderMap();

    fireEvent.click(marker("CS 3251 at Featheringill Hall, 2 seats left"));
    fireEvent.click(marker("MATH 2410 at Central Library, Full"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(within(screen.getByRole("dialog")).getByText("MATH 2410")).toBeTruthy();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(marker("CS 3251 at Featheringill Hall, 2 seats left"));
    fireEvent.click(screen.getByRole("button", { name: "map background" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the legend, so a hollow pin reads as Full", () => {
    renderMap();
    const region = screen.getByRole("region", { name: "Map of study sessions" });
    expect(within(region).getByText("Seats left")).toBeTruthy();
    expect(within(region).getByText("Full")).toBeTruthy();
  });
});

describe("<SessionMap> when Google fails", () => {
  it("says the map is unavailable when Google refuses the key, never Google's text", () => {
    const onShowList = renderMap();

    act(() => window.gm_authFailure?.());

    expect(screen.queryByTestId("google-map")).toBeNull();
    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeTruthy();
    expect(screen.getByText(mapUnavailableMessage("load_failed"))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show the list" }));
    expect(onShowList).toHaveBeenCalledOnce();
  });

  it("says the map is unavailable when the script fails to load", () => {
    renderMap();

    act(() => google.onError?.(new Error("net::ERR_INTERNET_DISCONNECTED")));

    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeTruthy();
    expect(screen.queryByText(/ERR_INTERNET/)).toBeNull();
  });

  it("passes a refused key on to any handler already there, and restores it when gone", () => {
    const previous = vi.fn();
    window.gm_authFailure = previous;
    renderMap();

    act(() => window.gm_authFailure?.());
    expect(previous).toHaveBeenCalledOnce();

    cleanup();
    expect(window.gm_authFailure).toBe(previous);
  });
});
