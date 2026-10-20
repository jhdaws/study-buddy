import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { joinSession, leaveSession } from "@/app/sessions/actions";
import type { Attendee } from "@/lib/sessions";

import SessionRoster, { type SessionRosterProps } from "./SessionRoster";

// The real actions are a "use server" module that imports server-only code;
// the database's side of joining is tested in tests/db/join-leave-session.test.ts.
vi.mock("@/app/sessions/actions", () => ({ joinSession: vi.fn(), leaveSession: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const joinMock = vi.mocked(joinSession);
const leaveMock = vi.mocked(leaveSession);

const SESSION = "11111111-1111-4111-8111-111111111111";
const attendees: Attendee[] = [
  { userId: "host", displayName: "Priya", isHost: true },
  { userId: "me", displayName: "Alex", isHost: false },
];

function renderRoster(overrides: Partial<SessionRosterProps> = {}) {
  render(
    <SessionRoster
      sessionId={SESSION}
      capacity={4}
      seatsLeft={2}
      attendees={attendees}
      viewerId="someone-else"
      action="join"
      {...overrides}
    />,
  );
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  joinMock.mockResolvedValue({});
  leaveMock.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionRoster", () => {
  it("lists who is going by display name, host marked, with the seat count (US-23)", () => {
    renderRoster({ viewerId: "me", action: "leave" });

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["PPriyaHost", "AAlex (you)"]);
    expect(screen.getByText("2 of 4 going")).toBeTruthy();
    expect(screen.getByText("2 seats left")).toBeTruthy();
  });

  it("joins this session when Join is pressed (US-04)", async () => {
    renderRoster();
    await click("Join session");

    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(joinMock.mock.calls[0][0]).toBe(SESSION);
    expect(leaveMock).not.toHaveBeenCalled();
  });

  it("leaves this session when Leave is pressed (US-08)", async () => {
    renderRoster({ viewerId: "me", action: "leave" });
    expect(screen.getByText("You're going.")).toBeTruthy();
    await click("Leave session");

    expect(leaveMock).toHaveBeenCalledTimes(1);
    expect(leaveMock.mock.calls[0][0]).toBe(SESSION);
  });

  it("disables Join on a full session and says why (US-07)", () => {
    renderRoster({ seatsLeft: 0, action: "full" });

    const button = screen.getByRole("button", { name: "Session full" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("roster-full-reason");
    expect(document.getElementById("roster-full-reason")?.textContent).toMatch(/Every seat is taken/);
  });

  it("shows the database's refusal, and refreshes the stale roster", async () => {
    joinMock.mockResolvedValue({ error: "This session is full." });
    renderRoster();
    await click("Join session");

    expect(screen.getByRole("alert").textContent).toBe("This session is full.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("tells the host they are hosting, with no button to leave", () => {
    renderRoster({ viewerId: "host", action: "hosting" });

    expect(screen.getByText("You're hosting this session.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a cancelled session was cancelled, with no button", () => {
    renderRoster({ action: "cancelled" });

    expect(screen.getByRole("status").textContent).toBe("The host cancelled this session.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says an ended session has ended, with no button", () => {
    renderRoster({ action: "ended" });

    expect(screen.getByText("This session has ended.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
