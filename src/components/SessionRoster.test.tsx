import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { joinSession, leaveSession } from "@/app/sessions/actions";
import { subscribeToRoster } from "@/lib/live-roster";
import type { Attendee } from "@/lib/sessions";

import SessionRoster, { type SessionRosterProps } from "./SessionRoster";

// The real actions are a "use server" module that imports server-only code;
// the database's side of joining is tested in tests/db/join-leave-session.test.ts.
vi.mock("@/app/sessions/actions", () => ({ joinSession: vi.fn(), leaveSession: vi.fn() }));
// Same for the report action (US-18); tests/db/reports.test.ts has its rules.
vi.mock("@/app/reports/actions", () => ({ reportUser: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The subscription itself is tested in src/lib/live-roster.test.ts; here,
// only whether the roster listens, and what it does when told of a change.
const stopListening = vi.hoisted(() => vi.fn());
vi.mock("@/lib/live-roster", () => ({ subscribeToRoster: vi.fn(() => stopListening) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => "browser-client" }));

const joinMock = vi.mocked(joinSession);
const leaveMock = vi.mocked(leaveSession);
const subscribeMock = vi.mocked(subscribeToRoster);

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

/**
 * The join/leave buttons, leaving out the per-entry Report buttons (US-18),
 * which every roster has -- a session that has ended can still be reported.
 */
function rosterButtons(): HTMLElement[] {
  return screen
    .queryAllByRole("button")
    .filter((button) => !button.getAttribute("aria-label")?.startsWith("Report "));
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
    // Everyone but the viewer has a Report button (US-18).
    expect(items.map((item) => item.textContent)).toEqual(["PPriyaHostReport", "AAlex (you)"]);
    expect(screen.getByText("2 of 4 going")).toBeTruthy();
    expect(screen.getByText("2 seats left")).toBeTruthy();
  });

  it("shows each attendee's major and year under their name when they gave them (US-11)", () => {
    renderRoster({
      attendees: [
        { userId: "host", displayName: "Priya", isHost: true, major: "Computer Science", classYear: "junior" },
        { userId: "me", displayName: "Alex", isHost: false, major: null, classYear: "graduate" },
        { userId: "sam", displayName: "Sam", isHost: false, major: null, classYear: null },
      ],
    });

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    // The viewer is someone else, so every entry also ends in US-18's Report.
    expect(items.map((item) => item.textContent)).toEqual([
      "PPriyaComputer Science · JuniorHostReport",
      "AAlexGraduate studentReport",
      "SSamReport",
    ]);
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
    expect(rosterButtons()).toEqual([]);
  });

  it("says a cancelled session was cancelled, with no button", () => {
    renderRoster({ action: "cancelled" });

    expect(screen.getByRole("status").textContent).toBe("The host cancelled this session.");
    expect(rosterButtons()).toEqual([]);
  });

  it("says an ended session has ended, with no button", () => {
    renderRoster({ action: "ended" });

    expect(screen.getByText("This session has ended.")).toBeTruthy();
    expect(rosterButtons()).toEqual([]);
  });
});

describe("SessionRoster: reporting someone (US-18)", () => {
  it("offers Report on everyone but the viewer", () => {
    renderRoster({ viewerId: "me", action: "leave" });
    expect(screen.getByRole("button", { name: "Report Priya" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Report Alex" })).toBeNull();
  });

  it("names a student with no display name yet neutrally", () => {
    renderRoster({
      attendees: [{ userId: "anon", displayName: null, isHost: false }],
    });
    expect(screen.getByRole("button", { name: "Report this student" })).toBeTruthy();
  });

  it("opens one report form, for that student and this session, and closes it again", () => {
    renderRoster({ viewerId: "me", action: "leave" });
    const report = screen.getByRole("button", { name: "Report Priya" });
    expect(report.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(report);
    expect(report.getAttribute("aria-expanded")).toBe("true");
    const form = screen.getByRole("form", { name: "Report Priya" }) as HTMLFormElement;
    const data = new FormData(form);
    expect(data.get("reportedUserId")).toBe("host");
    expect(data.get("sessionId")).toBe(SESSION);

    fireEvent.click(within(form).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: "Report Priya" })).toBeNull();
  });

  it("still offers Report once a session has ended or been cancelled", () => {
    for (const action of ["ended", "cancelled"] as const) {
      renderRoster({ action });
      expect(screen.getByRole("button", { name: "Report Priya" })).toBeTruthy();
      cleanup();
    }
  });

  it("is a 44px target (ADR 0004)", () => {
    renderRoster();
    expect(screen.getByRole("button", { name: "Report Priya" }).className).toContain("min-h-11");
  });

  describe("live roster", () => {
    it.each(["join", "full", "leave", "hosting"] as const)(
      "listens for joins and leaves while the viewer could act (%s)",
      (action) => {
        renderRoster({ action });

        expect(subscribeMock).toHaveBeenCalledTimes(1);
        expect(subscribeMock.mock.calls[0][0]).toBe("browser-client");
        expect(subscribeMock.mock.calls[0][1]).toBe(SESSION);
      },
    );

    it.each(["cancelled", "ended"] as const)("does not listen once nothing can change (%s)", (action) => {
      renderRoster({ action });
      expect(subscribeMock).not.toHaveBeenCalled();
    });

    it("refreshes the page when someone else joins or leaves", () => {
      renderRoster();
      expect(router.refresh).not.toHaveBeenCalled();

      const onChange = subscribeMock.mock.calls[0][2];
      act(() => onChange());

      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("stops listening when the roster leaves the page", () => {
      renderRoster();
      expect(stopListening).not.toHaveBeenCalled();

      cleanup();
      expect(stopListening).toHaveBeenCalledTimes(1);
    });

    it("keeps one subscription when fresh props arrive", () => {
      const props: SessionRosterProps = {
        sessionId: SESSION,
        capacity: 4,
        seatsLeft: 2,
        attendees,
        viewerId: "someone-else",
        action: "join",
      };
      const { rerender } = render(<SessionRoster {...props} />);
      rerender(<SessionRoster {...props} seatsLeft={0} action="full" />);

      expect(subscribeMock).toHaveBeenCalledTimes(1);
      expect(stopListening).not.toHaveBeenCalled();
    });

    it("announces the going count politely, so a screen reader hears it change", () => {
      renderRoster();
      expect(screen.getByText("2 of 4 going").getAttribute("aria-live")).toBe("polite");
    });
  });
});
