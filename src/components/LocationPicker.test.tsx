import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function pick(placeId: string) {
  fireEvent.change(screen.getByRole("combobox"), { target: { value: placeId } });
}

describe("<LocationPicker> contract", () => {
  it("reports the picked place's id and suggested label, and null when cleared", () => {
    const onSelect = vi.fn();
    render(<LocationPicker onSelect={onSelect} />);

    pick(first.placeId);
    expect(onSelect).toHaveBeenLastCalledWith({ placeId: first.placeId, label: first.label });

    pick("");
    expect(onSelect).toHaveBeenLastCalledWith(null);
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
