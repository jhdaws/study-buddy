import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MySession, SessionListItem } from "@/lib/sessions";

// The Home page is an async Server Component; it is rendered here with its
// data sources replaced.
const data = vi.hoisted(() => ({
  user: null as null | { id: string },
  name: "Moses Banda" as string | null,
  sessions: [] as SessionListItem[] | Error,
  mine: [] as MySession[],
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: data.user } }) } }),
  fetchDisplayName: async () => data.name,
}));
vi.mock("@/lib/sessions", () => ({
  listSessions: async () => {
    if (data.sessions instanceof Error) throw data.sessions;
    return data.sessions;
  },
  listMySessions: async () => data.mine,
}));

import HomePage from "./page";

const now = Date.now();
const iso = (hours: number) => new Date(now + hours * 3_600_000).toISOString();

function item(id: string, topic: string, startsIn: number, overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id,
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic,
    locationLabel: "Featheringill Hall",
    room: null,
    startsAt: iso(startsIn),
    endsAt: iso(startsIn + 2),
    capacity: 4,
    attendeeCount: 1,
    seatsLeft: 3,
    hostDisplayName: "Priya",
    hostId: "host",
    going: [{ userId: "host", displayName: "Priya" }],
    ...overrides,
  };
}

beforeEach(() => {
  data.user = { id: "me" };
  data.name = "Moses Banda";
  data.sessions = [];
  data.mine = [];
});
afterEach(cleanup);

describe("Home", () => {
  it("tells a signed-out visitor what Study Buddy is, and offers sign-in", async () => {
    data.user = null;
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1, name: /Find people studying your course/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in with your Vanderbilt email" }).getAttribute("href")).toBe("/login");
  });

  it("greets the student by first name and invites the first host when nothing is on", async () => {
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening), Moses$/);
    expect(screen.getByText("No sessions are open on campus right now.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Host the first session" }).getAttribute("href")).toBe("/sessions/new");
  });

  it("shows your sessions first, then the next five on campus under day headings", async () => {
    const list = [
      item("a", "Happening one", -1),
      ...Array.from({ length: 6 }, (_, i) => item(`n${i}`, `Later ${i}`, 30 + i)),
    ];
    data.sessions = list;
    data.mine = [{ ...item("m", "My hosted one", 30, { hostId: "me" }), status: "open" }];
    render(await HomePage());

    expect(screen.getByText(/7 sessions open on campus, 1 happening now\./)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Your sessions" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My hosted one" })).toBeTruthy();
    expect(screen.getByText("Hosting")).toBeTruthy();
    // Five under Next on campus: one now, four later.
    const next = screen.getByRole("heading", { level: 2, name: "Next on campus" }).closest("section")!;
    expect(next.querySelectorAll("a[href^='/sessions/']")).toHaveLength(5);
    expect(screen.getByRole("link", { name: /See all sessions/ }).getAttribute("href")).toBe("/sessions");
  });

  it("counts today's sessions when none is under way", async () => {
    data.sessions = [item("t", "Tonight", 0.5)];
    render(await HomePage());
    expect(screen.getByText(/1 session open on campus/)).toBeTruthy();
  });

  it("says when sessions could not load, instead of failing the page", async () => {
    data.sessions = new Error("down");
    data.name = null;
    render(await HomePage());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/^Good (morning|afternoon|evening)$/);
    expect(screen.getByText(/Sessions couldn't load/)).toBeTruthy();
  });
});
