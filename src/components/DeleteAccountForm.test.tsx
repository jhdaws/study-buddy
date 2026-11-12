import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deleteAccount } from "@/app/account/actions";

import DeleteAccountForm from "./DeleteAccountForm";

// The real action is a "use server" module that imports server-only code.
// What it does is in src/app/account/actions.test.ts.
vi.mock("@/app/account/actions", () => ({ deleteAccount: vi.fn() }));
const deleteMock = vi.mocked(deleteAccount);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<DeleteAccountForm> (US-24)", () => {
  it("submits only the confirmation -- never an account id", async () => {
    deleteMock.mockResolvedValue({});
    render(<DeleteAccountForm />);

    fireEvent.click(screen.getByLabelText(/can't be recovered/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    });

    expect(deleteMock).toHaveBeenCalledTimes(1);
    const data = deleteMock.mock.calls[0][1];
    expect([...data.keys()].filter((key) => !key.startsWith("$ACTION"))).toEqual(["confirm"]);
    expect(data.get("confirm")).toBe("yes");
  });

  it("shows the server's refusal beside the box", () => {
    render(
      <DeleteAccountForm
        initialState={{ fieldErrors: { confirm: ["Tick the box to confirm you want your account deleted."] } }}
      />,
    );
    const box = screen.getByLabelText(/can't be recovered/);
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Tick the box to confirm you want your account deleted.",
    );
  });

  it("shows a form-level error", () => {
    render(<DeleteAccountForm initialState={{ formError: "We couldn't delete your account just now." }} />);
    expect(screen.getByRole("alert").textContent).toBe("We couldn't delete your account just now.");
  });

  it("offers a way back that deletes nothing, and 44px controls (ADR 0004)", () => {
    render(<DeleteAccountForm />);
    const back = screen.getByRole("link", { name: "Keep my account" });
    expect(back.getAttribute("href")).toBe("/");
    expect(back.className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Delete my account" }).className).toContain("min-h-11");
    expect(screen.getByText(/can't be recovered/).className).toContain("min-h-11");
  });
});
