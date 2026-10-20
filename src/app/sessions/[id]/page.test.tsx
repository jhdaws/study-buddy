import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionDetail } from "@/lib/sessions";

// The session page is an async Server Component, rendered with its data
// sources replaced. Join and leave themselves are tested in SessionRoster.test.tsx.
const data = vi.hoisted(() => ({ session: null as SessionDetail | null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/sessions/actions", () => ({ joinSession: vi.fn(), leaveSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ requireUser: async () => ({ id: "me", displayName: "Moses" }) }));
vi.mock("@/lib/sessions", () => ({ getSession: async () => data.session }));

import SessionPage from "./page";

const iso = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Midterm 2 review",
    locationLabel: "Featheringill Hall",
    room: "2nd floor",
    startsAt: iso(2),
    endsAt: iso(4),
    capacity: 4,
    attendeeCount: 1,
    seatsLeft: 3,
    hostDisplayName: "Priya Raman",
    hostId: "host",
    status: "open",
    location: { lat: 36.1445, lng: -86.8035 },
    attendees: [{ userId: "host", displayName: "Priya Raman", isHost: true }],
    going: [{ userId: "host", displayName: "Priya Raman" }],
    ...overrides,
  };
}

const open = async () => render(await SessionPage({ params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) }));

beforeEach(() => {
  data.session = detail();
});
afterEach(cleanup);

describe("the session page", () => {
  it("404s for an id that is not a session", async () => {
    data.session = null;
    await expect(open()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows status, course, topic, when, where, host and seats, with Join beside the calendar", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Midterm 2 review");
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText("Featheringill Hall, 2nd floor")).toBeTruthy();
    expect(screen.getByText("Priya Raman", { selector: "dd span" })).toBeTruthy();
    expect(screen.getByText("3 of 4 seats left")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join session" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add to calendar/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Who's going" })).toBeTruthy();
  });

  it("tells the host it is theirs", async () => {
    data.session = detail({ hostId: "me", hostDisplayName: "Moses", attendees: [{ userId: "me", displayName: "Moses", isHost: true }] });
    await open();
    expect(screen.getByText("Hosting")).toBeTruthy();
    expect(screen.getByText("You're hosting")).toBeTruthy();
    expect(screen.getByText("You", { selector: "dd span" })).toBeTruthy();
  });

  it("is in the session now while it runs, and full when every seat is taken", async () => {
    data.session = detail({ startsAt: iso(-1), seatsLeft: 0, attendeeCount: 4 });
    await open();
    expect(screen.getByText("Happening now")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "In the session now" })).toBeTruthy();
    expect(screen.getByText("All 4 seats taken")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Session is full" })).toBeTruthy();
  });

  it("strikes through a cancelled session, with no calendar or join", async () => {
    data.session = detail({ status: "cancelled", location: null });
    await open();
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("line-through");
    expect(screen.getByText("The host cancelled this session.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add to calendar/ })).toBeNull();
  });

  it("calls an ended session's roster who went", async () => {
    data.session = detail({ startsAt: iso(-4), endsAt: iso(-2), hostDisplayName: null, hostId: null });
    await open();
    expect(screen.getByRole("heading", { name: "Who went" })).toBeTruthy();
    expect(screen.getByText("Deleted user")).toBeTruthy();
  });
});
