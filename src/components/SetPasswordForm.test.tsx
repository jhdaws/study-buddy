import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setPassword } from "@/app/login/actions";
import { PASSWORD_MIN_LENGTH } from "@/lib/limits";

import SetPasswordForm from "./SetPasswordForm";

vi.mock("@/app/login/actions", () => ({ setPassword: vi.fn() }));
const setPasswordMock = vi.mocked(setPassword);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<SetPasswordForm>", () => {
  it("asks for a new password twice, with the length rule and new-password autofill", () => {
    render(<SetPasswordForm next="/sessions/new" />);
    const password = screen.getByLabelText("New password") as HTMLInputElement;
    const again = screen.getByLabelText("Type it again") as HTMLInputElement;

    expect(password.type).toBe("password");
    expect(again.type).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(password.className).toContain("text-base");
    expect(screen.getByText(`At least ${PASSWORD_MIN_LENGTH} characters.`)).toBeTruthy();
    expect(
      (document.querySelector('input[type="hidden"][name="next"]') as HTMLInputElement).value,
    ).toBe("/sessions/new");
  });

  it("submits both fields to setPassword", async () => {
    setPasswordMock.mockResolvedValue({});
    render(<SetPasswordForm />);
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a long one" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a long one" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    });

    const submitted = setPasswordMock.mock.calls[0][1] as FormData;
    expect(submitted.get("password")).toBe("a long one");
    expect(submitted.get("confirmPassword")).toBe("a long one");
  });

  it("shows a field error beside its input", () => {
    render(
      <SetPasswordForm
        initialState={{ fieldErrors: { confirmPassword: ["The two passwords don't match."] } }}
      />,
    );
    const again = screen.getByLabelText("Type it again");
    expect(again.getAttribute("aria-invalid")).toBe("true");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("The two passwords don't match.");
    expect(again.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
