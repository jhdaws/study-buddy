import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cancelSession } from "@/app/sessions/actions";

import HostSessionControls, { type HostSessionControlsProps } from "./HostSessionControls";

// The real action is a "use server" module importing server-only code; the
// database's side of cancelling is in tests/db/edit-cancel-session.test.ts.
vi.mock("@/app/sessions/actions", () => ({ cancelSession: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const cancelMock = vi.mocked(cancelSession);

const SESSION = "11111111-1111-4111-8111-111111111111";

function renderControls(overrides: Partial<HostSessionControlsProps> = {}) {
  render(<HostSessionControls sessionId={SESSION} otherAttendees={2} {...overrides} />);
}

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  cancelMock.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  cancelMock.mockReset();
  router.refresh.mockReset();
});

describe("HostSessionControls (S7, US-09)", () => {
  it("links to the edit page", () => {
    renderControls();

    expect(screen.getByRole("link", { name: "Edit session" }).getAttribute("href")).toBe(
      `/sessions/${SESSION}/edit`,
    );
  });

  it("does not cancel on the first click -- it asks first", async () => {
    renderControls();

    await click("Cancel session");

    expect(cancelMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yes, cancel it" })).toBeTruthy();
  });

  it("says how many other students are coming", async () => {
    renderControls({ otherAttendees: 2 });
    await click("Cancel session");

    expect(screen.getByText(/2 other students are coming/)).toBeTruthy();
  });

  it("uses the singular for one other student", async () => {
    renderControls({ otherAttendees: 1 });
    await click("Cancel session");

    expect(screen.getByText(/1 other student is coming/)).toBeTruthy();
  });

  it("says nothing about other students when the host is alone", async () => {
    renderControls({ otherAttendees: 0 });
    await click("Cancel session");

    expect(screen.queryByText(/other student/)).toBeNull();
    expect(screen.getByText(/can't undo it/)).toBeTruthy();
  });

  it("cancels only after the confirm step", async () => {
    renderControls();

    await click("Cancel session");
    await click("Yes, cancel it");

    expect(cancelMock).toHaveBeenCalledTimes(1);
  });

  it("backs out without cancelling", async () => {
    renderControls();

    await click("Cancel session");
    await click("Keep the session");

    expect(cancelMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cancel session" })).toBeTruthy();
  });

  it("shows a refusal and refreshes, because the page was out of date", async () => {
    cancelMock.mockResolvedValue({ error: "This session has already ended." });
    renderControls();

    await click("Cancel session");
    await click("Yes, cancel it");

    expect(screen.getByRole("alert").textContent).toBe("This session has already ended.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does not refresh when cancelling worked", async () => {
    renderControls();

    await click("Cancel session");
    await click("Yes, cancel it");

    expect(screen.queryByRole("alert")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
