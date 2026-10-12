import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { signIn, verifyCode } from "@/app/login/actions";

import SignInForm from "./SignInForm";

// The real actions are a "use server" module that talks to Supabase; they
// are replaced so the form can be driven in jsdom.
vi.mock("@/app/login/actions", () => ({ signIn: vi.fn(), verifyCode: vi.fn() }));

const signInMock = vi.mocked(signIn);
const verifyCodeMock = vi.mocked(verifyCode);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function hidden(name: string): HTMLInputElement | null {
  return document.querySelector(`input[type="hidden"][name="${name}"]`);
}

async function click(name: RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** The input is invalid and points at an alert carrying `message`. */
function expectFieldError(input: HTMLElement, message: string) {
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const alert = screen
    .getAllByRole("alert")
    .find((element) => element.textContent === message);
  expect(alert, `no alert saying "${message}"`).toBeDefined();
  expect(input.getAttribute("aria-describedby")?.split(" ")).toContain(alert!.id);
}

describe("<SignInForm> email step", () => {
  it("asks for a Vanderbilt address, mobile-sized, with a hint", () => {
    render(<SignInForm />);
    const email = screen.getByLabelText("Vanderbilt email") as HTMLInputElement;

    expect(email.name).toBe("email");
    expect(email.type).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(email.className).toContain("text-base");
    expect(email.className).toContain("min-h-11");
    expect(screen.getByText(/Only @vanderbilt\.edu addresses can sign in/)).toBeTruthy();
    expect(email.getAttribute("aria-describedby")).toBeTruthy();
    expect(hidden("next")).toBeNull();
  });

  it("carries a next path in a hidden field", () => {
    render(<SignInForm next="/sessions/new" />);
    expect(hidden("next")?.value).toBe("/sessions/new");
  });

  it("shows a field error and a form error as alerts, keeping what was typed", () => {
    render(
      <SignInForm
        initialState={{
          fieldErrors: { email: ["Use your @vanderbilt.edu email address."] },
          formError: "Something went wrong on our side. Try again in a moment.",
          values: { email: "jane@gmail.com" },
        }}
      />,
    );
    const email = screen.getByLabelText("Vanderbilt email") as HTMLInputElement;
    expect(email.value).toBe("jane@gmail.com");
    expectFieldError(email, "Use your @vanderbilt.edu email address.");
    expect(
      screen.getAllByRole("alert").some((a) => a.textContent?.includes("Try again in a moment")),
    ).toBe(true);
  });

  it("submits to signIn, then moves to the code step for that address", async () => {
    signInMock.mockResolvedValue({ sentTo: "jane@vanderbilt.edu" });
    render(<SignInForm next="/sessions/new" />);

    fireEvent.change(screen.getByLabelText("Vanderbilt email"), {
      target: { value: "Jane@Vanderbilt.edu" },
    });
    await click(/email me a sign-in code/i);

    expect(signInMock).toHaveBeenCalledTimes(1);
    const sent = signInMock.mock.calls[0][1] as FormData;
    expect(sent.get("email")).toBe("Jane@Vanderbilt.edu");
    expect(sent.get("next")).toBe("/sessions/new");

    expect(screen.getByRole("heading", { name: "Check your inbox" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("jane@vanderbilt.edu");
  });
});

describe("<SignInForm> code step", () => {
  const sent = { sentTo: "jane@vanderbilt.edu" };

  it("asks for the code with a numeric, one-time-code input", () => {
    render(<SignInForm next="/sessions/new" initialState={sent} />);
    const code = screen.getByLabelText("Sign-in code") as HTMLInputElement;

    expect(code.name).toBe("code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.className).toContain("text-base");
    expect(code.className).toContain("min-h-11");
    expect(hidden("email")?.value).toBe("jane@vanderbilt.edu");
    expect(hidden("next")?.value).toBe("/sessions/new");
    // Both ways in are explained.
    expect(screen.getByRole("status").textContent).toMatch(/code below, or open the link/);
  });

  it("submits email, code and next to verifyCode", async () => {
    verifyCodeMock.mockResolvedValue({});
    render(<SignInForm next="/sessions/new" initialState={sent} />);

    fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: "123456" } });
    await click(/^sign in$/i);

    expect(verifyCodeMock).toHaveBeenCalledTimes(1);
    const data = verifyCodeMock.mock.calls[0][1] as FormData;
    expect(data.get("email")).toBe("jane@vanderbilt.edu");
    expect(data.get("code")).toBe("123456");
    expect(data.get("next")).toBe("/sessions/new");
  });

  it("shows a refused code as an alert and keeps it in the field", async () => {
    verifyCodeMock.mockResolvedValue({
      fieldErrors: { code: ["Enter the code from the email — digits only."] },
      values: { email: "jane@vanderbilt.edu", code: "12a456" },
    });
    render(<SignInForm initialState={sent} />);

    fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: "12a456" } });
    await click(/^sign in$/i);

    const code = screen.getByLabelText("Sign-in code") as HTMLInputElement;
    expect(code.value).toBe("12a456");
    expectFieldError(code, "Enter the code from the email — digits only.");
  });

  it("shows a form-level error from verifyCode", async () => {
    verifyCodeMock.mockResolvedValue({
      formError: "That code didn't work.",
      values: { email: "jane@vanderbilt.edu", code: "123456" },
    });
    render(<SignInForm initialState={sent} />);
    await click(/^sign in$/i);
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toContain(
      "That code didn't work.",
    );
  });

  it("goes back to the email step, prefilled, with 'Use a different email'", async () => {
    render(<SignInForm initialState={sent} />);
    await click(/use a different email/i);

    const email = screen.getByLabelText("Vanderbilt email") as HTMLInputElement;
    expect(email.value).toBe("jane@vanderbilt.edu");
    expect(screen.queryByLabelText("Sign-in code")).toBeNull();
  });

  it("shows the code step again after a new email is sent", async () => {
    signInMock.mockResolvedValue({ sentTo: "other@vanderbilt.edu" });
    render(<SignInForm initialState={sent} />);
    await click(/use a different email/i);

    fireEvent.change(screen.getByLabelText("Vanderbilt email"), {
      target: { value: "other@vanderbilt.edu" },
    });
    await click(/email me a sign-in code/i);

    expect(screen.getByRole("status").textContent).toContain("other@vanderbilt.edu");
    expect(hidden("email")?.value).toBe("other@vanderbilt.edu");
  });
});
