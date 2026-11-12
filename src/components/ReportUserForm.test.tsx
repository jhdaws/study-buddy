import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reportUser } from "@/app/reports/actions";

import ReportUserForm, { type ReportUserFormProps } from "./ReportUserForm";

// The real action is a "use server" module that imports server-only code;
// what it does is in src/app/reports/actions.test.ts, and the database's
// rules in tests/db/reports.test.ts.
vi.mock("@/app/reports/actions", () => ({ reportUser: vi.fn() }));
const reportMock = vi.mocked(reportUser);

const REPORTED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "11111111-1111-4111-8111-111111111111";

function renderForm(overrides: Partial<ReportUserFormProps> = {}) {
  const onClose = vi.fn();
  render(
    <ReportUserForm
      reportedUserId={REPORTED}
      displayName="Sam"
      sessionId={SESSION}
      onClose={onClose}
      {...overrides}
    />,
  );
  return onClose;
}

async function send() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<ReportUserForm> (US-18)", () => {
  it("asks for a reason and an optional note about the named student, and nothing else", () => {
    renderForm();
    expect(screen.getByRole("group", { name: "Report Sam" })).toBeTruthy();
    expect(screen.getAllByRole("radio").map((radio) => (radio as HTMLInputElement).value)).toEqual([
      "harassment",
      "safety",
      "spam",
      "other",
    ]);
    const note = screen.getByLabelText(/Anything else/) as HTMLTextAreaElement;
    expect(note.maxLength).toBe(500);
    expect(note.className).toContain("text-base");
    // Focus starts on the first reason, inside the form that just opened.
    expect(document.activeElement).toBe(screen.getAllByRole("radio")[0]);
  });

  it("sends who, the session, the reason and the note -- never who is reporting", async () => {
    reportMock.mockResolvedValue({ sent: true });
    renderForm();
    fireEvent.click(screen.getByLabelText("Made me feel unsafe"));
    fireEvent.change(screen.getByLabelText(/Anything else/), { target: { value: "Followed me out" } });
    await send();

    const data = reportMock.mock.calls[0][1];
    expect(Object.fromEntries([...data].filter(([key]) => !key.startsWith("$ACTION")))).toEqual({
      reportedUserId: REPORTED,
      sessionId: SESSION,
      reason: "safety",
      note: "Followed me out",
    });
  });

  it("confirms, without saying anything more about the student, and closes on Done", async () => {
    reportMock.mockResolvedValue({ sent: true });
    const onClose = renderForm();
    fireEvent.click(screen.getByLabelText("Spam or scams"));
    await send();

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Your report was sent to the Study Buddy team");
    expect(status.textContent).toContain("Sam won't be told who reported them.");
    expect(document.activeElement).toBe(status);
    expect(screen.queryByRole("button", { name: "Send report" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the chosen reason and note after a refusal, and shows the message", async () => {
    reportMock.mockResolvedValue({
      formError: "You've sent 5 reports in the last day, which is the limit.",
      values: { reason: "harassment", note: "Kept messaging me" },
    });
    renderForm();
    fireEvent.click(screen.getByLabelText("Harassment or bullying"));
    await send();

    expect(screen.getByRole("alert").textContent).toContain("5 reports in the last day");
    expect((screen.getByLabelText("Harassment or bullying") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Anything else/) as HTMLTextAreaElement).value).toBe(
      "Kept messaging me",
    );
  });

  it("shows field errors beside their fields", () => {
    renderForm({
      initialState: {
        fieldErrors: { reason: ["Choose a reason."], note: ["Keep the note to 500 characters or fewer."] },
      },
    });
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(["Choose a reason.", "Keep the note to 500 characters or fewer."]);
    expect(screen.getByLabelText(/Anything else/).getAttribute("aria-invalid")).toBe("true");
  });

  it("calls a nameless student 'this student'", () => {
    renderForm({ displayName: null });
    expect(screen.getByRole("group", { name: "Report this student" })).toBeTruthy();
  });

  it("closes on Cancel without sending", () => {
    const onClose = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("is mobile first: 44px reason rows and buttons (ADR 0004)", () => {
    renderForm();
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio.closest("label")?.className).toContain("min-h-11");
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button.className, button.textContent ?? "").toContain("min-h-11");
    }
  });
});
