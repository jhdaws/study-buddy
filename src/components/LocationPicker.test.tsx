import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAMPUS_CENTER, CAMPUS_RADIUS_METERS } from "@/lib/env";
import { PLACE_SEARCH_FAILED_MESSAGE } from "@/lib/errors";
import { FIXTURE_PLACES } from "@/lib/fixtures";
import { AUTOCOMPLETE_PRIMARY_TYPES, AUTOCOMPLETE_URL, MIN_QUERY_LENGTH } from "@/lib/place-search";

import LocationPicker from "./LocationPicker";

/**
 * The props contract (docs/contracts.md), for both of the picker's bodies:
 * the fixture <select> when there is no browser Maps key, and PlacesPicker
 * over Google's Autocomplete when there is. Google is never called: fetch is
 * stubbed, and the map (the Maps JavaScript API) is replaced.
 */

vi.mock("@/components/LocationMap", () => ({
  default: ({ pin, title }: { pin: { lat: number; lng: number }; title: string }) => (
    <div data-testid="location-map" data-lat={pin.lat} data-lng={pin.lng}>
      {title}
    </div>
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Without a key: the fixture places
// ---------------------------------------------------------------------------

describe("<LocationPicker> without a Maps key (the fixture places)", () => {
  const [first, second] = FIXTURE_PLACES;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
  });

  function pick(placeId: string) {
    fireEvent.change(screen.getByRole("combobox"), { target: { value: placeId } });
  }

  it("is a plain select of the fixture places", () => {
    render(<LocationPicker />);
    const options = [...(screen.getByRole("combobox") as HTMLSelectElement).options];
    expect(options.map((option) => option.value)).toEqual([
      "",
      ...FIXTURE_PLACES.map((place) => place.placeId),
    ]);
  });

  it("reports the picked place's id and suggested label, and null when cleared", () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);

    pick(first.placeId);
    expect(onSelect).toHaveBeenLastCalledWith({ placeId: first.placeId, label: first.label });

    pick("");
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("takes a pick on `input` alone, before any `change` (BUG-15)", () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    select.value = second.placeId;
    fireEvent.input(select);
    expect(onSelect).toHaveBeenLastCalledWith({ placeId: second.placeId, label: second.label });

    // The `change` that follows is a no-op, not a second report.
    fireEvent.change(select);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("submits the place id under `placeId` by default, or the name given", () => {
    const { container, rerender } = render(
      <form>
        <LocationPicker />
      </form>,
    );
    pick(first.placeId);
    expect(new FormData(container.querySelector("form")!).get("placeId")).toBe(first.placeId);

    rerender(
      <form>
        <LocationPicker name="venue" />
      </form>,
    );
    expect(new FormData(container.querySelector("form")!).get("venue")).toBe(first.placeId);
  });

  it("starts from defaultValue", () => {
    const { container } = render(
      <form>
        <LocationPicker defaultValue={{ placeId: second.placeId, label: second.label }} />
      </form>,
    );
    expect(new FormData(container.querySelector("form")!).get("placeId")).toBe(second.placeId);
  });

  it("keeps its selection when React resets the form after an action", async () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <form action={action}>
        <LocationPicker />
        <input name="topic" defaultValue="" aria-label="Topic" />
        <button type="submit">Create</button>
      </form>,
    );

    pick(second.placeId);
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Exam prep" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(action).toHaveBeenCalledOnce();
    const form = container.querySelector("form")!;
    // The uncontrolled input was reset, proving a reset happened...
    expect(new FormData(form).get("topic")).toBe("");
    // ...and the picker kept the host's choice.
    expect(new FormData(form).get("placeId")).toBe(second.placeId);
  });
});

// ---------------------------------------------------------------------------
// With a key: Places Autocomplete (New), fetch stubbed
// ---------------------------------------------------------------------------

type FakePlace = { placeId: string; name: string; address: string };

const FEATHERINGILL: FakePlace = {
  placeId: "ChIJQVdfNb1mZIgRoCFoSaNt4Do",
  name: "Featheringill Hall",
  address: "24th Avenue South, Nashville, TN, USA",
};
const FEATHER_ROOM: FakePlace = {
  placeId: "ChIJFeatherRoomCafe00000000",
  name: "Feather Room Café",
  address: "21st Avenue South, Nashville, TN, USA",
};
const CENTRAL_LIBRARY: FakePlace = {
  placeId: "ChIJCentralLibrary000000000",
  name: "Central Library",
  address: "21st Avenue South, Nashville, TN, USA",
};
const GOOGLE_PLACES = [FEATHERINGILL, FEATHER_ROOM, CENTRAL_LIBRARY];
const PIN = { latitude: 36.1445184, longitude: -86.8036674 };
const TOKENS = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
];

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return { ok: status < 400, status, json: async () => body };
}

/** Google, faked: Autocomplete matches names by substring; Place Details gives PIN. */
function googleAnswers() {
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    if (url === AUTOCOMPLETE_URL) {
      const { input } = JSON.parse(String(init.body)) as { input: string };
      const matches = GOOGLE_PLACES.filter((place) =>
        place.name.toLowerCase().includes(input.toLowerCase()),
      );
      return reply(200, {
        suggestions: matches.map((place) => ({
          placePrediction: {
            placeId: place.placeId,
            text: { text: `${place.name}, ${place.address}` },
            structuredFormat: {
              mainText: { text: place.name },
              secondaryText: { text: place.address },
            },
          },
        })),
      });
    }
    return reply(200, { location: PIN });
  });
}

/** The Autocomplete requests made so far, as [body, init]. */
function autocompleteCalls() {
  return fetchMock.mock.calls
    .filter(([url]) => url === AUTOCOMPLETE_URL)
    .map(([, init]) => [JSON.parse(String(init.body)), init] as const);
}

function box() {
  return screen.getByRole("combobox") as HTMLInputElement;
}

function type(text: string) {
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: text } });
}

/** Type, wait for the suggestions, and click the one named `name`. */
async function pick(text: string, name: string) {
  type(text);
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(name) }));
}

function formData(container: HTMLElement) {
  return new FormData(container.querySelector("form")!);
}

describe("<LocationPicker> with a Maps key (Places Autocomplete)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-browser-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    googleAnswers();
    let next = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(
      () => TOKENS[next++] as `${string}-${string}-${string}-${string}-${string}`,
    );
  });

  it("is a search box, not the fixture select", () => {
    render(<LocationPicker />);
    expect(box().tagName).toBe("INPUT");
    expect(box().className).toContain("text-base"); // no iOS zoom (ADR 0004)
    expect(screen.queryByRole("option", { name: FIXTURE_PLACES[0].label })).toBeNull();
  });

  it("searches inside the campus circle, for the chosen types, with the browser key", async () => {
    render(<LocationPicker />);
    type("Feath");
    await screen.findByRole("option", { name: /Featheringill Hall/ });

    const [[body, init]] = autocompleteCalls();
    expect(body).toMatchObject({
      input: "Feath",
      sessionToken: TOKENS[0],
      locationRestriction: {
        circle: {
          center: { latitude: CAMPUS_CENTER.lat, longitude: CAMPUS_CENTER.lng },
          radius: CAMPUS_RADIUS_METERS,
        },
      },
      includedPrimaryTypes: [...AUTOCOMPLETE_PRIMARY_TYPES],
    });
    expect((init.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe("test-browser-key");
  });

  it(`waits for ${MIN_QUERY_LENGTH} characters before asking Google`, async () => {
    render(<LocationPicker />);
    type("F");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one session token for a whole typing session, and cancels a stale search", async () => {
    let answerFirst: (value: unknown) => void = () => {};
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    render(<LocationPicker />);

    type("Fe");
    await waitFor(() => expect(autocompleteCalls()).toHaveLength(1));
    type("Feath");
    await screen.findByRole("option", { name: /Featheringill Hall/ });

    const [[first, firstInit], [second]] = autocompleteCalls();
    expect(first.sessionToken).toBe(TOKENS[0]);
    expect(second.sessionToken).toBe(TOKENS[0]);
    expect((firstInit.signal as AbortSignal).aborted).toBe(true);

    // The stale answer arriving late changes nothing.
    await act(async () => answerFirst(reply(200, { suggestions: [] })));
    expect(screen.getAllByRole("option")).toHaveLength(2);
  });

  it("reports the pick, submits its place id and session token -- never coordinates", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <form>
        <LocationPicker onSelect={onSelect} />
      </form>,
    );

    await pick("Feath", "Featheringill Hall");

    expect(onSelect).toHaveBeenLastCalledWith({
      placeId: FEATHERINGILL.placeId,
      label: FEATHERINGILL.name,
    });
    expect(box().value).toBe("Featheringill Hall");
    const data = formData(container);
    expect(data.get("placeId")).toBe(FEATHERINGILL.placeId);
    expect(data.get("placeSessionToken")).toBe(TOKENS[0]);
    expect([...data.keys()].sort()).toEqual(["placeId", "placeSessionToken"]);
    expect([...data.values()].join(" ")).not.toContain(String(PIN.latitude));
  });

  it("shows the pick on a map, from a lookup that leaves the session token to the server", async () => {
    render(<LocationPicker />);
    await pick("Feath", "Featheringill Hall");

    const map = await screen.findByTestId("location-map");
    expect(map.dataset.lat).toBe(String(PIN.latitude));
    expect(map.textContent).toBe("Featheringill Hall");

    const [url, init] = fetchMock.mock.calls.find(([u]) => u !== AUTOCOMPLETE_URL)!;
    expect(String(url)).toBe(`https://places.googleapis.com/v1/places/${FEATHERINGILL.placeId}`);
    expect(String(url)).not.toContain("sessionToken");
    expect(init.headers).toEqual({ "X-Goog-Api-Key": "test-browser-key", "X-Goog-FieldMask": "location" });
  });

  it("still works when the pin lookup fails: there is just no map", async () => {
    const answer = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
      if (url !== AUTOCOMPLETE_URL) throw new TypeError("Failed to fetch");
      return answer(url, init);
    });
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);

    await pick("Central", "Central Library");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => {});

    expect(onSelect).toHaveBeenLastCalledWith({
      placeId: CENTRAL_LIBRARY.placeId,
      label: CENTRAL_LIBRARY.name,
    });
    expect(screen.queryByTestId("location-map")).toBeNull();
  });

  it("starts a new session token after a pick, and clearing reports null", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <form>
        <LocationPicker onSelect={onSelect} />
      </form>,
    );
    await pick("Feath", "Featheringill Hall");

    fireEvent.click(screen.getByRole("button", { name: "Clear location" }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(formData(container).get("placeId")).toBe("");
    expect(formData(container).get("placeSessionToken")).toBe("");
    expect(screen.queryByTestId("location-map")).toBeNull();

    await pick("Central", "Central Library");
    expect(autocompleteCalls().at(-1)![0].sessionToken).toBe(TOKENS[1]);
    expect(formData(container).get("placeSessionToken")).toBe(TOKENS[1]);
  });

  it("un-chooses the place when the host edits its name, so the box never disagrees with the form", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <form>
        <LocationPicker onSelect={onSelect} />
      </form>,
    );
    await pick("Feath", "Featheringill Hall");

    fireEvent.change(box(), { target: { value: "Featheringill Hal" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(formData(container).get("placeId")).toBe("");
  });

  it("is a keyboard combobox: arrows move, Enter picks, Escape closes", async () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);
    type("Feath");
    await screen.findAllByRole("option");
    expect(box().getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box().getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    const active = box().getAttribute("aria-activedescendant")!;
    expect(document.getElementById(active)?.textContent).toContain(FEATHER_ROOM.name);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    fireEvent.keyDown(box(), { key: "Enter" });

    // Up from the first wraps to the last: Feather Room Café.
    expect(onSelect).toHaveBeenLastCalledWith({
      placeId: FEATHER_ROOM.placeId,
      label: FEATHER_ROOM.name,
    });
  });

  it("says so when nothing near campus matches", async () => {
    render(<LocationPicker />);
    type("Stadium");
    expect(await screen.findByText(/No places near campus match/)).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows our own message, never Google's, when the search fails", async () => {
    fetchMock.mockResolvedValue(
      reply(403, { error: { status: "PERMISSION_DENIED", message: "API key not valid for this referer" } }),
    );
    render(<LocationPicker />);
    type("Feath");

    expect((await screen.findAllByText(PLACE_SEARCH_FAILED_MESSAGE)).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/referer|API key/);
  });

  it("starts from defaultValue, with no session token to spend", () => {
    const { container } = render(
      <form>
        <LocationPicker defaultValue={{ placeId: FEATHERINGILL.placeId, label: FEATHERINGILL.name }} />
      </form>,
    );
    expect(box().value).toBe("Featheringill Hall");
    expect(formData(container).get("placeId")).toBe(FEATHERINGILL.placeId);
    expect(formData(container).get("placeSessionToken")).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps its selection when React resets the form after an action", async () => {
    const action = vi.fn(async () => {});
    const { container } = render(
      <form action={action}>
        <LocationPicker name="venue" />
        <input name="topic" defaultValue="" aria-label="Topic" />
        <button type="submit">Create</button>
      </form>,
    );

    await pick("Central", "Central Library");
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "Exam prep" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
    });

    expect(action).toHaveBeenCalledOnce();
    expect(formData(container).get("topic")).toBe("");
    expect(formData(container).get("venue")).toBe(CENTRAL_LIBRARY.placeId);
    expect(formData(container).get("placeSessionToken")).toBe(TOKENS[0]);
    expect(box().value).toBe("Central Library");
  });
});
