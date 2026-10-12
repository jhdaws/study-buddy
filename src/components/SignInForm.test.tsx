import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SignInForm from "./SignInForm";

// The action is a Server Function; these tests are about what the form
// renders for a given state, not about what signIn() does.
vi.mock("@/app/login/actions", () => ({ signIn: vi.fn() }));

afterEach(cleanup);

describe("<SignInForm>", () => {
  it("asks for an email address", () => {
    render(<SignInForm />);

    const input = screen.getByRole("textbox", { name: "Vanderbilt email" });
    // The field name must be signInSchema's key exactly, or the action's
    // field errors come back under a name the form never shows.
    expect(input.getAttribute("name")).toBe("email");
    expect(input.getAttribute("type")).toBe("email");
    expect(screen.getByRole("button", { name: /sign-in link/i })).toBeTruthy();
  });

  it("carries `next` as a hidden field so the link returns there", () => {
    const { container } = render(<SignInForm next="/sessions/new" />);

    const hidden = container.querySelector('input[name="next"]');
    expect(hidden?.getAttribute("value")).toBe("/sessions/new");
  });

  it("omits the hidden field when there is nowhere particular to go", () => {
    const { container } = render(<SignInForm />);
    expect(container.querySelector('input[name="next"]')).toBeNull();
  });

  it("shows a field error as an alert, linked to the input", () => {
    render(
      <SignInForm
        initialState={{
          fieldErrors: { email: ["Use your @vanderbilt.edu email address."] },
          values: { email: "someone@gmail.com" },
        }}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Vanderbilt email" });
    const alert = screen.getByRole("alert");

    expect(alert.textContent).toMatch(/@vanderbilt\.edu/);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    // The error must be reachable from the input, not just visually near it.
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    // React resets the form after an action: the typed value comes back.
    expect((input as HTMLInputElement).value).toBe("someone@gmail.com");
  });

  it("shows a form-level error as an alert", () => {
    render(<SignInForm initialState={{ formError: "Too many sign-in emails." }} />);
    expect(screen.getByRole("alert").textContent).toBe("Too many sign-in emails.");
  });

  it("shows a notice about a dead link above the form", () => {
    render(<SignInForm notice="That sign-in link has expired." />);

    expect(screen.getByRole("alert").textContent).toMatch(/expired/);
    // Still offering the form: a new link is the way out.
    expect(screen.getByRole("textbox", { name: "Vanderbilt email" })).toBeTruthy();
  });

  it("replaces the form with a confirmation once a link is sent", () => {
    render(<SignInForm initialState={{ sentTo: "nate@vanderbilt.edu" }} />);

    expect(screen.getByRole("status").textContent).toContain(
      "nate@vanderbilt.edu",
    );
    // Submitting again would send a second link and kill the first.
    expect(screen.queryByRole("textbox", { name: "Vanderbilt email" })).toBeNull();
    expect(screen.queryByRole("button", { name: /sign-in link/i })).toBeNull();
  });
});
