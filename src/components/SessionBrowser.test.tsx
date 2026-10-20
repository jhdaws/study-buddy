import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionListItem } from "@/lib/sessions";

import SessionBrowser from "./SessionBrowser";
import SessionCard from "./SessionCard";

vi.mock("next/navigation", () => ({ usePathname: () => "/sessions" }));

afterEach(cleanup);

// Thursday 1 Oct 2026, 10 AM in Nashville.
const now = new Date("2026-10-01T15:00:00Z");

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "30000000-0000-4000-8000-000000000099",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Design patterns review",
    locationLabel: "Featheringill Hall",
    room: "2nd floor study area",
    startsAt: "2026-10-01T19:00:00.000Z",
    endsAt: "2026-10-01T21:00:00.000Z",
    capacity: 4,
    attendeeCount: 2,
    seatsLeft: 2,
    hostDisplayName: "Priya",
    hostId: "host",
    going: [
      { userId: "host", displayName: "Priya Raman" },
      { userId: "me", displayName: "Moses Banda" },
    ],
    ...overrides,
  };
}

const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ").trim();

describe("<SessionCard>", () => {
  it("is one link to the session page, named by its topic", () => {
    render(<SessionCard session={session()} now={now} />);
    const link = screen.getByRole("link", { name: "Design patterns review" });
    expect(link.getAttribute("href")).toBe("/sessions/30000000-0000-4000-8000-000000000099");
    // The calendar journey finds sessions by this id.
    expect(screen.getByRole("heading").id).toBe("session-30000000-0000-4000-8000-000000000099");
  });

  it("shows the course line, topic, campus time range and place", () => {
    render(<SessionCard session={session()} now={now} />);
    const card = screen.getByRole("link");
    expect(plain(card.textContent)).toContain("CS 3251·Intermediate Software Design");
    // Campus time: 19:00 UTC is 2 PM in Nashville, whatever the machine's zone.
    const time = card.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-01T19:00:00.000Z");
    expect(plain(time.textContent)).toBe("2:00 to 4:00 PM");
    expect(within(card).getByText("Featheringill Hall, 2nd floor study area")).toBeTruthy();
  });

  it("leads with the day only when asked", () => {
    const { rerender } = render(<SessionCard session={session()} now={now} />);
    expect(plain(screen.getByRole("link").querySelector("time")!.textContent)).toBe("2:00 to 4:00 PM");
    rerender(<SessionCard session={session()} now={now} showDay />);
    expect(plain(screen.getByRole("link").querySelector("time")!.textContent)).toBe("Today, 2:00 to 4:00 PM");
  });

  it("counts seats taken of total, and gives a full session the Full pill", () => {
    const { rerender } = render(<SessionCard session={session()} now={now} />);
    expect(screen.getByText("2 of 4 seats")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByRole("link").hasAttribute("data-full")).toBe(false);

    rerender(<SessionCard session={session({ attendeeCount: 4, seatsLeft: 0 })} now={now} />);
    expect(screen.getByText("Full")).toBeTruthy();
    expect(screen.getByText("4 of 4 seats")).toBeTruthy();
    expect(screen.getByRole("link").hasAttribute("data-full")).toBe(true);
  });

  it("says Happening now while a session is under way", () => {
    render(<SessionCard session={session({ startsAt: "2026-10-01T14:00:00.000Z" })} now={now} />);
    expect(screen.getByText("Happening now")).toBeTruthy();
  });

  it("tells the host Hosting and anyone on the roster Joined", () => {
    const { rerender } = render(<SessionCard session={session()} now={now} viewerId="host" />);
    expect(screen.getByText("Hosting")).toBeTruthy();
    rerender(<SessionCard session={session()} now={now} viewerId="me" />);
    expect(screen.getByText("Joined")).toBeTruthy();
    rerender(<SessionCard session={session()} now={now} viewerId="someone" />);
    expect(screen.queryByText("Joined")).toBeNull();
    expect(screen.queryByText("Hosting")).toBeNull();
  });

  it("shows initials for who is going, three at most, then +n", () => {
    const going = ["Ann Bo", "Cy Dee", "Ed Fox", "Gus Hu", "Ivy Jo"].map((displayName, i) => ({
      userId: `u${i}`,
      displayName,
    }));
    render(<SessionCard session={session({ going, attendeeCount: 5, capacity: 6, seatsLeft: 1 })} now={now} />);
    const card = screen.getByRole("link");
    expect(plain(card.textContent)).toContain("ABCDEF+2");
  });

  it("strikes through a cancelled session and dates a past one", () => {
    const { rerender } = render(<SessionCard session={{ ...session(), status: "cancelled" }} now={now} />);
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByRole("heading").className).toContain("line-through");
    rerender(
      <SessionCard
        session={session({ startsAt: "2026-09-29T19:00:00.000Z", endsAt: "2026-09-29T21:00:00.000Z" })}
        now={now}
      />,
    );
    expect(screen.getByText("Ended")).toBeTruthy();
    expect(plain(screen.getByRole("link").querySelector("time")!.textContent)).toBe("Tue Sep 29");
  });

  it("copes with no course title, no room and nobody listed", () => {
    render(<SessionCard session={session({ course: { departmentCode: "CHEM", number: "1601L", title: null }, room: null, going: undefined })} now={now} />);
    const card = screen.getByRole("link");
    expect(plain(card.textContent)).toContain("CHEM 1601L");
    expect(plain(card.textContent)).not.toContain("·");
    expect(within(card).getByText("Featheringill Hall")).toBeTruthy();
  });
});

describe("<SessionBrowser>", () => {
  const list = [
    session({ id: "a", topic: "Design patterns review" }),
    session({
      id: "b",
      topic: "Exam 2 practice problems",
      course: { departmentCode: "MATH", number: "2410", title: "Methods of Linear Algebra" },
      locationLabel: "Central Library",
      attendeeCount: 3,
      capacity: 3,
      seatsLeft: 0,
      startsAt: "2026-10-01T20:00:00.000Z",
      endsAt: "2026-10-01T22:00:00.000Z",
    }),
    session({
      id: "c",
      topic: "Lab report write-up",
      course: { departmentCode: "CHEM", number: "1601L", title: null },
      startsAt: "2026-10-02T19:00:00.000Z",
      endsAt: "2026-10-02T21:00:00.000Z",
    }),
  ];

  const topics = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

  it("lists cards under campus-day headings with a count, in the order given", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    expect(screen.getByRole("heading", { level: 2, name: "Today" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Tomorrow" })).toBeTruthy();
    expect(screen.getByText("2 sessions")).toBeTruthy();
    expect(topics()).toEqual(["Design patterns review", "Exam 2 practice problems", "Lab report write-up"]);
  });

  it("narrows the list as the student types, and says how many are shown", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter sessions" }), { target: { value: "linear" } });
    expect(topics()).toEqual(["Exam 2 practice problems"]);
    expect(screen.getByText("1 session shown")).toBeTruthy();
  });

  it("starts from the top bar's search and the sidebar's course", () => {
    const { unmount } = render(<SessionBrowser sessions={list} now={now} initialQuery="lab" />);
    expect(topics()).toEqual(["Lab report write-up"]);
    unmount();
    render(<SessionBrowser sessions={list} now={now} initialCourse="MATH 2410" />);
    expect(topics()).toEqual(["Exam 2 practice problems"]);
  });

  it("filters with pills, marks the pressed one, and clears", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    const seats = screen.getByRole("button", { name: "Has seats" });
    fireEvent.click(seats);
    expect(seats.getAttribute("aria-pressed")).toBe("true");
    expect(topics()).toEqual(["Design patterns review", "Lab report write-up"]);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(topics()).toEqual(["Design patterns review"]);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(topics()).toHaveLength(3);
  });

  it("filters by course and place from the Filter popover, and counts them on its button", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    fireEvent.click(screen.getByRole("button", { name: "Filter" }));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    fireEvent.change(within(dialog).getByLabelText("Place"), { target: { value: "Central Library" } });
    expect(topics()).toEqual(["Exam 2 practice problems"]);
    expect(screen.getByRole("button", { name: "Filter (1)" })).toBeTruthy();
  });

  it("offers to clear or host when nothing matches", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter sessions" }), { target: { value: "chem 9999" } });
    expect(screen.getByRole("heading", { name: "No sessions for “chem 9999” yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "host it" }).getAttribute("href")).toBe("/sessions/new");
  });

  it("invites the first host when there are no sessions at all", () => {
    render(<SessionBrowser sessions={[]} now={now} />);
    expect(screen.getByRole("heading", { name: "No study sessions yet" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Host the first session" }).getAttribute("href")).toBe("/sessions/new");
  });

  it("splits sessions into board columns: now, today, tomorrow, later", () => {
    render(<SessionBrowser sessions={list} now={now} initialView="board" />);
    const column = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section")!;
    expect(within(column("Today")).getAllByRole("link")).toHaveLength(2);
    expect(within(column("Tomorrow")).getAllByRole("link")).toHaveLength(1);
    expect(within(column("Happening now")).getByText("Nothing here yet.")).toBeTruthy();
  });

  it("switches views with the tabs", () => {
    render(<SessionBrowser sessions={list} now={now} />);
    fireEvent.click(screen.getByRole("tab", { name: "Calendar" }));
    expect(screen.getByRole("tab", { name: "Calendar" }).getAttribute("aria-selected")).toBe("true");
    // The week grid: this Thursday's blocks link through.
    expect(screen.getAllByRole("link", { name: /CS 3251/ }).length).toBeGreaterThan(0);
  });
});
