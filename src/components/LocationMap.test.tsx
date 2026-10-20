import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MapPanel } from "./LocationMap";

// Leaflet needs a real browser; CampusMap.test.tsx covers it with a fake.
vi.mock("@/components/CampusMap", () => ({
  default: ({ pin, label }: { pin: { lat: number; lng: number } | null; label?: string }) => (
    <div data-testid="map">{pin ? `${label} at ${pin.lat},${pin.lng}` : "campus"}</div>
  ),
}));

afterEach(cleanup);

describe("<MapPanel>", () => {
  it("shows campus with no pin, and no caption without a place", () => {
    const { container } = render(<MapPanel pin={null} />);
    expect(screen.getByTestId("map").textContent).toBe("campus");
    expect(container.textContent).not.toContain("On campus");
  });

  it("pins the place and captions it", () => {
    render(<MapPanel pin={{ lat: 36.1449, lng: -86.8034 }} label="Featheringill Hall" />);
    expect(screen.getByTestId("map").textContent).toBe("Featheringill Hall at 36.1449,-86.8034");
    expect(screen.getByText("On campus")).toBeTruthy();
  });

  it("can leave the caption off", () => {
    const { container } = render(<MapPanel pin={null} label="Somewhere" caption={false} />);
    expect(container.textContent).not.toContain("On campus");
  });
});
