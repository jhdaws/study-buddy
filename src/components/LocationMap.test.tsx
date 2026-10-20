import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { hasGoogleMaps, MapPanel } from "./LocationMap";

afterEach(cleanup);

// No NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in tests: the plain stand-in renders.
describe("<MapPanel> without a Google key", () => {
  it("shows campus with no pin, and no caption without a place", () => {
    expect(hasGoogleMaps()).toBe(false);
    const { container } = render(<MapPanel pin={null} />);
    expect(screen.getByText("Vanderbilt University")).toBeTruthy();
    expect(container.textContent).not.toContain("On campus");
  });

  it("drops a pin and captions the place, and says the map turns on with Google", () => {
    render(<MapPanel pin={{ lat: 36.1445, lng: -86.8035 }} label="Featheringill Hall" />);
    expect(screen.getByTitle("Featheringill Hall")).toBeTruthy();
    expect(screen.getByText("On campus")).toBeTruthy();
    expect(screen.getByText(/Map turns on once Google Maps is connected/)).toBeTruthy();
  });

  it("keeps a pin far off the grid inside the frame", () => {
    render(<MapPanel pin={{ lat: 40, lng: -80 }} label="Far away" caption={false} />);
    const pin = screen.getByTitle("Far away") as HTMLElement;
    expect(pin.style.left).toBe("90%");
    expect(pin.style.top).toBe("30%");
  });
});
