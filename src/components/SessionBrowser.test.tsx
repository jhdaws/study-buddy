import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mapUnavailableMessage } from "@/lib/errors";
import { fixtureSessionList } from "@/lib/fixtures";
import type { SessionListItem } from "@/lib/sessions";

import SessionBrowser from "./SessionBrowser";
import SessionCard from "./SessionCard";

// next/navigation, as far as the List / Map toggle uses it: useSearchParams()
// over jsdom's real address bar, re-rendering when history.replaceState()
// moves it. That is what Next's router does for real -- it folds native
// pushState/replaceState into useSearchParams ("Native History API",
// node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md).
const addressBar = vi.hoisted(() => ({ listeners: new Set<() => void>() }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    addressBar.listeners.add(listener);
    return () => addressBar.listeners.delete(listener);
  };
  return {
    useSearchParams: () =>
      new URLSearchParams(useSyncExternalStore(subscribe, () => window.location.search)),
    // Course chips (US-06) navigate for real so the server re-filters; the
    // List / Map toggle still uses replaceState and never touches this.
    useRouter: () => router,
  };
});

// The real map needs Google; SessionMap.test.tsx tests it with a fake one.
// Here it only has to show what it was given.
vi.mock("@/components/SessionMap", () => ({
  default: ({ sessions, apiKey }: { sessions: SessionListItem[]; apiKey: string }) => (
    <div data-testid="session-map" data-api-key={apiKey}>
      {sessions.map((item) => item.id).join(",")}
    </div>
  ),
}));

const replaceState = window.history.replaceState.bind(window.history);

beforeEach(() => {
  replaceState(null, "", "/sessions");
  router.push.mockReset();
  vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
    replaceState(...args);
    addressBar.listeners.forEach((listener) => listener());
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Thursday 1 Oct 2026, 10 AM in Nashville.
const now = new Date("2026-10-01T15:00:00Z");

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "30000000-0000-4000-8000-000000000099",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Design patterns review",
    locationLabel: "Featheringill Hall",
    room: "2nd floor study area",
    lat: 36.1445,
    lng: -86.8035,
    startsAt: "2026-10-01T19:00:00.000Z",
    endsAt: "2026-10-01T21:00:00.000Z",
    capacity: 4,
    attendeeCount: 2,
    seatsLeft: 2,
    hostDisplayName: "Priya",
    ...overrides,
  };
}

const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

describe("<SessionCard>", () => {
  it("offers the session as a calendar download (US-19)", () => {
    render(<SessionCard session={session()} now={now} />);
    const link = screen.getByRole("link", { name: /add to calendar/i });
    expect(link.getAttribute("href")).toBe("/sessions/30000000-0000-4000-8000-000000000099/calendar.ics");
    expect(link.hasAttribute("download")).toBe(true);
  });

  it("shows the day above the time only when asked", () => {
    const { rerender } = render(<SessionCard session={session()} now={now} />);
    expect(screen.queryByText("Today")).toBeNull();
    rerender(<SessionCard session={session()} now={now} showDay />);
    expect(screen.getByText("Today")).toBeTruthy();
  });

  it("shows the course, topic, place, room, campus time and host", () => {
    render(<SessionCard session={session()} now={now} />);
    const card = screen.getByRole("article");

    expect(plain(within(card).getByRole("heading").textContent)).toBe(
      "CS 3251 Intermediate Software Design",
    );
    expect(within(card).getByText("Design patterns review")).toBeTruthy();
    expect(plain(within(card).getByText(/Featheringill Hall/).textContent)).toBe(
      "Featheringill Hall, 2nd floor study area",
    );
    // Campus time: 19:00 UTC is 2 PM in Nashville, whatever the machine's zone.
    const time = card.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-01T19:00:00.000Z");
    expect(plain(time.textContent)).toBe("2:00 PM");
    expect(plain(card.textContent)).toContain("to 4:00 PM");
    expect(within(card).getByText("Priya")).toBeTruthy();
  });

  it("says how many seats are left, singular and plural", () => {
    const { rerender } = render(<SessionCard session={session()} now={now} />);
    expect(screen.getByText("2 seats left")).toBeTruthy();

    rerender(<SessionCard session={session({ attendeeCount: 3, seatsLeft: 1 })} now={now} />);
    expect(screen.getByText("1 seat left")).toBeTruthy();
  });

  it("gives a full session the Full treatment instead of a seat count", () => {
    render(
      <SessionCard session={session({ capacity: 3, attendeeCount: 3, seatsLeft: 0 })} now={now} />,
    );
    const card = screen.getByRole("article");

    expect(within(card).getByText("Full")).toBeTruthy();
    expect(within(card).queryByText(/seats? left/)).toBeNull();
    expect(card.dataset.full).toBe("true");
  });

  it("does not mark a session with seats as full", () => {
    render(<SessionCard session={session()} now={now} />);
    expect(screen.getByRole("article").dataset.full).toBeUndefined();
    expect(screen.queryByText("Full")).toBeNull();
  });

  it("copes with no course title, no room and a deleted host", () => {
    render(
      <SessionCard
        session={session({
          course: { departmentCode: "CHEM", number: "1601L", title: null },
          room: null,
          locationLabel: "Café on 21st",
          hostDisplayName: null,
        })}
        now={now}
      />,
    );
    const card = screen.getByRole("article");

    expect(plain(within(card).getByRole("heading").textContent)).toBe("CHEM 1601L");
    expect(within(card).getByText("Café on 21st").textContent).toBe("Café on 21st");
    expect(within(card).getByText("Deleted user")).toBeTruthy();
  });

  it("flags a session that is already under way", () => {
    render(
      <SessionCard
        session={session({ startsAt: "2026-10-01T14:30:00.000Z", endsAt: "2026-10-01T16:00:00.000Z" })}
        now={now}
      />,
    );
    expect(screen.getByText(/Happening now/)).toBeTruthy();
  });
});

describe("<SessionBrowser>", () => {
  it("renders one card per session, in the order given", () => {
    const sessions = fixtureSessionList(now);
    render(<SessionBrowser sessions={sessions} now={now} />);

    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(sessions.length);
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual(
      sessions.map((s) => expect.stringContaining(`${s.course.departmentCode} ${s.course.number}`)),
    );
    // The fixtures include one full session (MATH 2410).
    expect(screen.getAllByText("Full")).toHaveLength(1);
  });

  it("invites the visitor to host when there are no sessions", () => {
    render(<SessionBrowser sessions={[]} now={now} />);

    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("heading", { name: "No study sessions yet" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Host the first session" });
    expect(link.getAttribute("href")).toBe("/sessions/new");
  });
});

describe("<SessionBrowser> search and filters", () => {
  const sessions = [
    session({ id: "a" }),
    session({
      id: "b",
      course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
      topic: "Exam 2 practice problems",
      capacity: 3,
      attendeeCount: 3,
      seatsLeft: 0,
    }),
    session({ id: "c", startsAt: "2026-10-02T19:00:00.000Z", endsAt: "2026-10-02T21:00:00.000Z" }),
  ];
  const headings = () => screen.getAllByRole("article").map((a) => plain(within(a).getByRole("heading").textContent));

  it("groups cards under campus-day headings", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);
    expect(screen.getByRole("heading", { name: /^Today/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Tomorrow/ })).toBeTruthy();
    expect(screen.getByText("3 open sessions")).toBeTruthy();
  });

  it("narrows the list as the student types, and says how many match", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "linear" } });
    expect(headings()).toEqual(["MATH 2410 Methods of Linear Algebra"]);
    expect(screen.getByText(/Showing 1 of 3 sessions/)).toBeTruthy();
  });

  it("filters with chips, marks the pressed one, and clears", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);
    const today = screen.getByRole("button", { name: "Today" });
    fireEvent.click(today);
    expect(today.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "All" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByRole("article")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Has seats" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);

    fireEvent.click(screen.getAllByRole("button", { name: "Clear filters" })[0]);
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("offers to clear or host when nothing matches", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);
    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "ECON 3012" } });
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("heading", { name: /No sessions for .ECON 3012. yet/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Host a session" }).getAttribute("href")).toBe("/sessions/new");
  });
});

describe("<SessionBrowser> List / Map toggle (M4)", () => {
  const sessions = [
    session({ id: "a" }),
    session({
      id: "b",
      course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
      topic: "Exam 2 practice problems",
    }),
  ];
  const toggle = () => screen.getByRole("group", { name: "Show sessions as" });
  const listButton = () => within(toggle()).getByRole("button", { name: "List" });
  const mapButton = () => within(toggle()).getByRole("button", { name: "Map" });

  it("opens on the list, with List pressed (ADR 0004)", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);

    expect(listButton().getAttribute("aria-pressed")).toBe("true");
    expect(mapButton().getAttribute("aria-pressed")).toBe("false");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("gives both buttons a 44px tap target", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);

    for (const button of [listButton(), mapButton()]) {
      expect(button.className).toContain("min-h-11");
    }
  });

  it("switches to the map and back, keeping the choice in the URL", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.click(mapButton());
    expect(window.location.search).toBe("?view=map");
    expect(mapButton().getAttribute("aria-pressed")).toBe("true");
    expect(listButton().getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByRole("article")).toBeNull();

    fireEvent.click(listButton());
    expect(window.location.pathname).toBe("/sessions");
    expect(window.location.search).toBe("");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("replaces the history entry rather than adding one per tap", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    const push = vi.spyOn(window.history, "pushState");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.click(mapButton());
    fireEvent.click(listButton());

    expect(window.history.replaceState).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it("opens on the map when the URL asks for it, as after a reload", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    replaceState(null, "", "/sessions?view=map");
    render(<SessionBrowser sessions={sessions} now={now} />);

    expect(mapButton().getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("keeps any other query parameters", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    // A real US-06 course filter: the map toggle must not drop it.
    replaceState(null, "", "/sessions?course=CS-3251");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.click(mapButton());
    expect(window.location.search).toBe("?course=CS-3251&view=map");
    fireEvent.click(listButton());
    expect(window.location.search).toBe("?course=CS-3251");
  });

  it("without a browser key, says the map is unavailable and never loads it", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    replaceState(null, "", "/sessions?view=map");
    render(<SessionBrowser sessions={sessions} now={now} />);

    expect(screen.getByRole("heading", { name: "Map unavailable" })).toBeTruthy();
    expect(screen.getByText(mapUnavailableMessage("not_configured"))).toBeTruthy();
    expect(screen.queryByTestId("session-map")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();

    // The list is a tap away, and unharmed.
    fireEvent.click(screen.getByRole("button", { name: "Show the list" }));
    expect(listButton().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("with a key, loads the map with the key and the sessions the filters leave", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-browser-key");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "linear" } });
    fireEvent.click(mapButton());

    const map = await screen.findByTestId("session-map");
    expect(map.textContent).toBe("b");
    expect(map.getAttribute("data-api-key")).toBe("test-browser-key");
    expect(screen.queryByRole("heading", { name: "Map unavailable" })).toBeNull();
  });

  it("says nothing matches, rather than showing an empty map", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-browser-key");
    replaceState(null, "", "/sessions?view=map");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.change(screen.getByLabelText("Search sessions"), { target: { value: "ECON 3012" } });
    expect(screen.getByRole("heading", { name: /No sessions for .ECON 3012. yet/ })).toBeTruthy();
    expect(screen.queryByTestId("session-map")).toBeNull();
  });
});

describe("<SessionBrowser> course filter (US-06)", () => {
  const sessions = [
    session({ id: "a" }),
    session({
      id: "b",
      course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
      topic: "Exam 2 practice problems",
    }),
  ];

  it("offers a chip per course in the list, plus All courses", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);

    const group = screen.getByRole("group", { name: "Filter by course" });
    expect(within(group).getByRole("button", { name: "All courses" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(group).getByRole("button", { name: "CS 3251" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "MATH 2410" })).toBeTruthy();
  });

  it("marks the active course chip when the page passed a filter", () => {
    render(
      <SessionBrowser
        sessions={sessions.filter((item) => item.course.departmentCode === "CS")}
        now={now}
        courseFilter={{ departmentCode: "CS", number: "3251" }}
      />,
    );

    const group = screen.getByRole("group", { name: "Filter by course" });
    expect(within(group).getByRole("button", { name: "CS 3251" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(group).getByRole("button", { name: "All courses" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    // The count shares a <p> with the Clear filters control, so match a
    // substring rather than the whole text content.
    expect(screen.getByText(/1 session for CS 3251/)).toBeTruthy();
  });

  it("navigates when a course chip is pressed, so the server re-filters", () => {
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.click(screen.getByRole("button", { name: "MATH 2410" }));

    // push, not replaceState: listSessions has to run again with the filter.
    expect(router.push).toHaveBeenCalledWith("/sessions?course=MATH-2410");
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it("keeps the map view when changing course", () => {
    replaceState(null, "", "/sessions?view=map");
    render(<SessionBrowser sessions={sessions} now={now} />);

    fireEvent.click(screen.getByRole("button", { name: "CS 3251" }));

    expect(router.push).toHaveBeenCalledWith("/sessions?view=map&course=CS-3251");
  });

  it("clears the course filter back to the full list", () => {
    render(
      <SessionBrowser
        sessions={sessions}
        now={now}
        courseFilter={{ departmentCode: "CS", number: "3251" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "All courses" }));

    expect(router.push).toHaveBeenCalledWith("/sessions");
  });

  it("keeps every course's chip while filtered, when the page passes the full course list", () => {
    render(
      <SessionBrowser
        sessions={sessions.filter((item) => item.course.departmentCode === "CS")}
        now={now}
        courseFilter={{ departmentCode: "CS", number: "3251" }}
        courses={[
          { departmentCode: "CS", number: "3251" },
          { departmentCode: "MATH", number: "2300" },
        ]}
      />,
    );

    const group = screen.getByRole("group", { name: "Filter by course" });
    // Without `courses`, MATH 2300's chip would be gone: the filtered list
    // only holds CS sessions.
    fireEvent.click(within(group).getByRole("button", { name: "MATH 2300" }));
    expect(router.push).toHaveBeenCalledWith("/sessions?course=MATH-2300");
  });

  it("says so when the course filter matched nothing", () => {
    render(
      <SessionBrowser
        sessions={[]}
        now={now}
        courseFilter={{ departmentCode: "ECON", number: "3012" }}
      />,
    );

    // Not the cold-start empty: that would tell the student there are no
    // sessions on campus at all.
    expect(screen.queryByRole("heading", { name: "No study sessions yet" })).toBeNull();
    expect(screen.getByRole("heading", { name: "No sessions for ECON 3012 yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show all courses" })).toBeTruthy();
  });
});
