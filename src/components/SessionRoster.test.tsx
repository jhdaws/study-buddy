import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { joinSession, leaveSession } from "@/app/sessions/actions";
import type { Attendee } from "@/lib/sessions";

import SessionActions, { type SessionActionsProps, WhosGoing } from "./SessionRoster";

// The real actions are a "use server" module that imports server-only code;
// the database's side of joining is tested in tests/db/join-leave-session.test.ts.
vi.mock("@/app/sessions/actions", () => ({ joinSession: vi.fn(), leaveSession: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const joinMock = vi.mocked(joinSession);
const leaveMock = vi.mocked(leaveSession);

const SESSION = "11111111-1111-4111-8111-111111111111";
const attendees: Attendee[] = [
  { userId: "host", displayName: "Priya Raman", isHost: true },
  { userId: "me", displayName: "Alex", isHost: false },
];
const details: SessionActionsProps["session"] = {
  course: { departmentCode: "CS", number: "3251", title: null },
  topic: "Design patterns",
  startsAt: "2026-10-01T19:30:00.000Z",
  endsAt: "2026-10-01T21:00:00.000Z",
  locationLabel: "Featheringill Hall",
  room: null,
};

function renderActions(overrides: Partial<SessionActionsProps> = {}) {
  render(<SessionActions sessionId={SESSION} action="join" session={details} canAddToCalendar {...overrides} />);
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

describe("<WhosGoing> (US-23)", () => {
  it("lists who is going by display name, host marked, you marked, with seats taken", () => {
    render(<WhosGoing capacity={4} attendees={attendees} viewerId="me" />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["PRPriya RamanHost", "AAlex (you)"]);
    expect(screen.getByText("of 4 seats taken").previousSibling?.textContent).toBe("2");
  });

  it("can say who is in the session now, or who went", () => {
    render(<WhosGoing capacity={4} attendees={attendees} viewerId="me" title="Who went" />);
    expect(screen.getByRole("heading", { name: "Who went" })).toBeTruthy();
  });
});

describe("<SessionActions>", () => {
  it("joins this session when Join is pressed, and confirms with a toast (US-04)", async () => {
    renderActions();
    await click("Join session");

    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(joinMock.mock.calls[0][0]).toBe(SESSION);
    expect(leaveMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("You're in. See you at Featheringill Hall.");
  });

  it("leaves this session when Leave is pressed (US-08)", async () => {
    renderActions({ action: "leave" });
    await click("Leave session");

    expect(leaveMock).toHaveBeenCalledTimes(1);
    expect(leaveMock.mock.calls[0][0]).toBe(SESSION);
  });

  it("disables Join on a full session and says why (US-07)", () => {
    renderActions({ action: "full" });

    const button = screen.getByRole("button", { name: "Session is full" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe("roster-full-reason");
    expect(document.getElementById("roster-full-reason")?.textContent).toMatch(/Every seat is taken/);
  });

  it("shows the database's refusal, and refreshes the stale roster", async () => {
    joinMock.mockResolvedValue({ error: "This session is full." });
    renderActions();
    await click("Join session");

    expect(screen.getByRole("alert").textContent).toBe("This session is full.");
    expect(router.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("tells the host they are hosting, with no join or leave button", () => {
    renderActions({ action: "hosting", canAddToCalendar: false });

    expect(screen.getByText("You're hosting")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a cancelled session was cancelled, with no button", () => {
    renderActions({ action: "cancelled", canAddToCalendar: false });

    expect(screen.getByRole("status").textContent).toBe("The host cancelled this session.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says an ended session has ended, with no button", () => {
    renderActions({ action: "ended", canAddToCalendar: false });

    expect(screen.getByText("This session has ended.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers Google Calendar, or the .ics for Apple and Outlook (US-19)", async () => {
    renderActions();
    await click("Add to calendar");

    const google = screen.getByRole("menuitem", { name: /Google Calendar/ }) as HTMLAnchorElement;
    expect(google.href).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    const ics = screen.getByRole("menuitem", { name: /Apple Calendar or Outlook/ }) as HTMLAnchorElement;
    expect(ics.getAttribute("href")).toBe(`/sessions/${SESSION}/calendar.ics`);
    expect(ics.hasAttribute("download")).toBe(true);
  });
});
