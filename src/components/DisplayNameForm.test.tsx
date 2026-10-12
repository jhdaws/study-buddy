import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/limits";

import DisplayNameForm from "./DisplayNameForm";

vi.mock("@/app/login/actions", () => ({ saveDisplayName: vi.fn() }));

afterEach(cleanup);

describe("<DisplayNameForm>", () => {
  it("asks for a display name, capped at the shared limit", () => {
    render(<DisplayNameForm />);

    const input = screen.getByRole("textbox", { name: "Display name" });
    // The field name must be displayNameSchema's key exactly.
    expect(input.getAttribute("name")).toBe("displayName");
    // The same number the A2 CHECK uses; one constant, three places.
    expect(input.getAttribute("maxLength")).toBe(String(DISPLAY_NAME_MAX_LENGTH));
  });

  it("carries `next` so the save returns where the user was headed", () => {
    const { container } = render(<DisplayNameForm next="/sessions/new" />);

    expect(
      container.querySelector('input[name="next"]')?.getAttribute("value"),
    ).toBe("/sessions/new");
  });

  it("shows a field error as an alert, linked to the input", () => {
    render(
      <DisplayNameForm
        initialState={{
          fieldErrors: { displayName: ["Enter a display name."] },
          values: { displayName: "   " },
        }}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Display name" });
    const alert = screen.getByRole("alert");

    expect(alert.textContent).toBe("Enter a display name.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect((input as HTMLInputElement).value).toBe("   ");
  });

  it("shows a form-level error as an alert", () => {
    render(
      <DisplayNameForm initialState={{ formError: "We couldn't save your name." }} />,
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn't save your name.",
    );
  });

  it("does not mention the user's email address", () => {
    // US-25: the email stays in auth.users and is never shown back.
    const { container } = render(<DisplayNameForm />);
    expect(container.textContent).not.toMatch(/@/);
  });
});
