import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { saveDisplayName } from "@/app/login/actions";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/limits";

import DisplayNameForm from "./DisplayNameForm";

vi.mock("@/app/login/actions", () => ({ saveDisplayName: vi.fn() }));

const saveMock = vi.mocked(saveDisplayName);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<DisplayNameForm>", () => {
  it("asks for a display name, mobile-sized and capped at the limit", () => {
    render(<DisplayNameForm next="/sessions/new" />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;

    expect(input.name).toBe("displayName");
    expect(input.maxLength).toBe(DISPLAY_NAME_MAX_LENGTH);
    expect(input.className).toContain("text-base");
    expect(input.className).toContain("min-h-11");
    expect(
      (document.querySelector('input[type="hidden"][name="next"]') as HTMLInputElement).value,
    ).toBe("/sessions/new");
  });

  it("submits the name and next to saveDisplayName", async () => {
    saveMock.mockResolvedValue({});
    render(<DisplayNameForm next="/sessions/new" />);
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "Priya" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    });

    const data = saveMock.mock.calls[0][1] as FormData;
    expect(data.get("displayName")).toBe("Priya");
    expect(data.get("next")).toBe("/sessions/new");
  });

  it("shows a field error as a linked alert and keeps what was typed", () => {
    render(
      <DisplayNameForm
        initialState={{
          fieldErrors: { displayName: ["Enter a display name."] },
          values: { displayName: "   " },
        }}
      />,
    );
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    const alert = screen.getByRole("alert");

    expect(input.value).toBe("   ");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(alert.textContent).toBe("Enter a display name.");
    expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
  });

  it("shows a form-level error", () => {
    render(<DisplayNameForm initialState={{ formError: "We couldn't find your profile." }} />);
    expect(screen.getByRole("alert").textContent).toBe("We couldn't find your profile.");
  });
});
