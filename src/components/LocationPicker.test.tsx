import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_PLACES } from "@/lib/fixtures";

import LocationPicker from "./LocationPicker";

/**
 * The props contract M2 (#23) must keep when it replaces the stub body
 * (docs/contracts.md). These tests exercise the stub; M2 should keep them
 * passing, adapting only how a place gets picked.
 */

afterEach(cleanup);

const [first, second] = FIXTURE_PLACES;

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

  it("offers every place for an empty search, and narrows as the host types", async () => {
    render(<LocationPicker />);
    fireEvent.focus(screen.getByRole("combobox"));
    expect(await screen.findAllByRole("option")).toHaveLength(FIXTURE_PLACES.length);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "feath" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    screen.getByRole("option", { name: /Featheringill/ });
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
