import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { findCampusPlace, STARTER_PLACE_IDS } from "@/lib/campus-places";

import LocationPicker from "./LocationPicker";

/**
 * The props contract (docs/contracts.md, W4 #11), over the campus list the
 * picker offers since 2026-10-20. Leaflet needs a real browser, so the map
 * is replaced by a stand-in that shows where its pin is.
 */

vi.mock("@/components/CampusMap", () => ({
  default: ({ pin, label }: { pin: { lat: number; lng: number } | null; label?: string }) => (
    <div data-testid="map">{pin ? `${label} at ${pin.lat},${pin.lng}` : "campus"}</div>
  ),
}));

afterEach(cleanup);

const place = (id: string) => {
  const found = findCampusPlace(id)!;
  return { placeId: found.id, label: found.name, lat: found.lat, lng: found.lng };
};
const first = place(STARTER_PLACE_IDS[0]);
const second = place(STARTER_PLACE_IDS[1]);

/** Type a place's name and click the matching suggestion. */
async function pick(label: string) {
  const box = screen.getByRole("combobox");
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value: label } });
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(label) }));
}

function clear() {
  fireEvent.click(screen.getByRole("button", { name: "Clear place" }));
}

describe("<LocationPicker> contract", () => {
  it("reports the picked place's id and suggested label, and null when cleared", async () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);

    await pick(first.label);
    expect(onSelect).toHaveBeenLastCalledWith({ placeId: first.placeId, label: first.label });

    clear();
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("offers the starter places for an empty search, and narrows as the host types", async () => {
    render(<LocationPicker />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(await screen.findAllByRole("option")).toHaveLength(STARTER_PLACE_IDS.length);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "feath" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    screen.getByRole("option", { name: /Featheringill Hall\s*Campus building/ });
  });

  it("finds places by nickname, and says so when nothing matches", async () => {
    render(<LocationPicker />);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "EBI" } });
    screen.getByRole("option", { name: /E. Bronson Ingram Dining Hall/ });
    fireEvent.change(box, { target: { value: "zzzz" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    screen.getByText(/No campus places match/);
  });

  it("pins the chosen place on the map at its committed coordinates", async () => {
    render(<LocationPicker />);
    expect(screen.getByTestId("map").textContent).toBe("campus");
    await pick(first.label);
    expect(screen.getByTestId("map").textContent).toBe(`${first.label} at ${first.lat},${first.lng}`);
    clear();
    expect(screen.getByTestId("map").textContent).toBe("campus");
  });

  it("drops the choice when the host edits the text, and Escape closes the list", async () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);
    await pick(first.label);
    const box = screen.getByRole("combobox");
    fireEvent.change(box, { target: { value: "Sarr" } });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(box.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("is a keyboard combobox: arrows move, Enter picks, Escape closes", async () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);
    const box = screen.getByRole("combobox");
    fireEvent.focus(box);
    await screen.findAllByRole("option");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenLastCalledWith({ placeId: second.placeId, label: second.label });
    expect(box.getAttribute("aria-expanded")).toBe("false");
  });

  it("submits the place id under `placeId` by default, or the name given", async () => {
    const { container, rerender } = render(
      <form>
        <LocationPicker />
      </form>,
    );
    await pick(first.label);
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

    await pick(second.label);
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
