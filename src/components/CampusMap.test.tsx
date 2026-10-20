import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMPUS_CENTER } from "@/lib/env";

import CampusMap, { CAMPUS_ZOOM, PLACE_ZOOM } from "./CampusMap";

// A fake Leaflet that records what the component asks of it.
const L = vi.hoisted(() => {
  const calls = {
    map: [] as unknown[][],
    setView: [] as unknown[][],
    markers: [] as { at: unknown; options: Record<string, unknown>; removed: boolean }[],
    tiles: [] as unknown[][],
    removed: 0,
  };
  const api = {
    calls,
    map: (el: unknown, options: unknown) => {
      calls.map.push([el, options]);
      return {
        setView: (...args: unknown[]) => calls.setView.push(args),
        invalidateSize: () => {},
        remove: () => {
          calls.removed += 1;
        },
      };
    },
    tileLayer: (...args: unknown[]) => {
      calls.tiles.push(args);
      return { addTo: () => {} };
    },
    divIcon: (options: unknown) => ({ icon: options }),
    marker: (at: unknown, options: Record<string, unknown>) => {
      const entry = { at, options, removed: false };
      calls.markers.push(entry);
      const marker = {
        addTo: () => marker,
        remove: () => {
          entry.removed = true;
        },
      };
      return marker;
    },
  };
  return api;
});
vi.mock("leaflet", () => ({ ...L, default: L }));

beforeEach(() => {
  L.calls.map.length = 0;
  L.calls.setView.length = 0;
  L.calls.markers.length = 0;
  L.calls.tiles.length = 0;
  L.calls.removed = 0;
});
afterEach(cleanup);

describe("<CampusMap>", () => {
  it("opens on campus with OpenStreetMap tiles and credit, and no pin", async () => {
    render(<CampusMap pin={null} />);
    expect(screen.getByRole("img", { name: "Map of campus" })).toBeTruthy();
    await waitFor(() => expect(L.calls.map).toHaveLength(1));
    expect(L.calls.map[0][1]).toMatchObject({
      center: [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
      zoom: CAMPUS_ZOOM,
      scrollWheelZoom: false,
    });
    expect(L.calls.tiles[0][0]).toContain("tile.openstreetmap.org");
    expect(JSON.stringify(L.calls.tiles[0][1])).toContain("OpenStreetMap contributors");
    expect(L.calls.markers).toHaveLength(0);
  });

  it("opens on a place with a fixed pin, follows a new pick, and clears", async () => {
    const featheringill = { lat: 36.144892, lng: -86.803358 };
    const { rerender, unmount } = render(<CampusMap pin={featheringill} label="Featheringill Hall" />);
    expect(screen.getByRole("img", { name: "Map showing Featheringill Hall" })).toBeTruthy();
    await waitFor(() => expect(L.calls.markers).toHaveLength(1));
    expect(L.calls.map[0][1]).toMatchObject({ center: [featheringill.lat, featheringill.lng], zoom: PLACE_ZOOM });
    expect(L.calls.markers[0].options).toMatchObject({ title: "Featheringill Hall" });
    expect(L.calls.markers[0].options.draggable).toBeFalsy();

    rerender(<CampusMap pin={{ lat: 36.1457, lng: -86.8002 }} label="Central Library" />);
    expect(L.calls.markers[0].removed).toBe(true);
    expect(L.calls.markers[1].at).toEqual([36.1457, -86.8002]);
    expect(L.calls.setView.at(-1)).toEqual([[36.1457, -86.8002], PLACE_ZOOM]);

    rerender(<CampusMap pin={null} />);
    expect(L.calls.markers[1].removed).toBe(true);
    expect(L.calls.setView.at(-1)).toEqual([[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], CAMPUS_ZOOM]);

    unmount();
    expect(L.calls.removed).toBe(1);
  });

  it("builds nothing if it is gone before Leaflet loads", async () => {
    const { unmount } = render(<CampusMap pin={null} />);
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(L.calls.map).toHaveLength(0);
  });
});
