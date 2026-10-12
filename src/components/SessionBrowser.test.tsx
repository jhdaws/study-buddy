import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureSessionList } from "@/lib/fixtures";
import type { SessionListItem } from "@/lib/sessions";

import SessionBrowser from "./SessionBrowser";
import SessionCard from "./SessionCard";

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
    ...overrides,
  };
}

const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

describe("<SessionCard>", () => {
  it("shows how many are going out of the capacity", () => {
    render(<SessionCard session={session({ capacity: 6, attendeeCount: 4, seatsLeft: 2 })} now={now} />);
    expect(screen.getByText("4 of 6 going")).toBeTruthy();
  });

  it("renders a compact card with the same facts for the home feed", () => {
    render(<SessionCard session={session()} now={now} variant="compact" />);
    const card = screen.getByRole("article");
    expect(plain(within(card).getByRole("heading").textContent)).toBe(
      "CS 3251 · Intermediate Software Design",
    );
    expect(within(card).getByText("Design patterns review")).toBeTruthy();
    expect(within(card).getByText("2 seats left")).toBeTruthy();
    expect(within(card).getByText("Priya")).toBeTruthy();
    expect(card.querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-01T19:00:00.000Z");
  });

  it("shows the course, topic, place, room, campus time and host", () => {
    render(<SessionCard session={session()} now={now} />);
    const card = screen.getByRole("article");

    expect(plain(within(card).getByRole("heading").textContent)).toBe(
      "CS 3251 · Intermediate Software Design",
    );
    expect(within(card).getByText("Design patterns review")).toBeTruthy();
    expect(plain(within(card).getByText(/Featheringill Hall/).textContent)).toBe(
      "Featheringill Hall · 2nd floor study area",
    );
    const time = card.querySelector("time")!;
    expect(time.getAttribute("dateTime")).toBe("2026-10-01T19:00:00.000Z");
    expect(plain(time.textContent)).toBe("Today · 2:00 – 4:00 PM");
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
    expect(headings()).toEqual(["MATH 2410 · Methods of Linear Algebra"]);
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
    expect(screen.getByRole("heading", { name: /Nothing for .ECON 3012. yet/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Host a session" }).getAttribute("href")).toBe("/sessions/new");
  });
});
