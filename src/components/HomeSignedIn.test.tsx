import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomeSignedIn from "./HomeSignedIn";
import type { MySession, PastSession, SessionListItem } from "@/lib/sessions";
import type { StudyRequestGroup } from "@/lib/study-requests";

// The signed-in Home (H1, #128): which sections show, and what each leaves
// out. The readers behind them are tested in sessions.test.ts.

const NOW = new Date("2026-11-11T18:00:00Z");

function session(id: string, dept: string, number: string, topic: string): SessionListItem {
  return {
    id,
    course: { departmentCode: dept, number, title: null },
    topic,
    locationLabel: "Central Library",
    room: null,
    lat: 36.14,
    lng: -86.8,
    startsAt: "2026-11-11T20:00:00Z",
    endsAt: "2026-11-11T22:00:00Z",
    capacity: 4,
    attendeeCount: 1,
    seatsLeft: 3,
    hostDisplayName: "Priya",
  };
}

const mine = (s: SessionListItem, hosting: boolean): MySession => ({ ...s, hosting });
const past = (s: SessionListItem, cancelled: boolean): PastSession => ({
  ...s,
  hosting: false,
  cancelled,
});

function request(dept: string, number: string, count: number, viewerAsked = false): StudyRequestGroup {
  return {
    courseId: `${dept}-${number}`,
    course: { departmentCode: dept, number, title: null },
    count,
    viewerAsked,
    viewerRequestId: viewerAsked ? "r1" : null,
    notes: [],
  };
}

function renderHome(props: Partial<Parameters<typeof HomeSignedIn>[0]> = {}) {
  return render(
    <HomeSignedIn
      displayName="Alex"
      sessions={[]}
      newSessions={[]}
      mine={[]}
      past={[]}
      courses={[]}
      requests={[]}
      now={NOW}
      {...props}
    />,
  );
}

const region = (name: string) => screen.getByRole("region", { name });

describe("<HomeSignedIn>", () => {
  it("leads with the student's own sessions, marking the ones they host", () => {
    renderHome({
      mine: [
        mine(session("a", "CS", "3251", "Hosting this one"), true),
        mine(session("b", "MATH", "2300", "Going to this one"), false),
      ],
    });

    const upcoming = region("Your upcoming sessions");
    expect(upcoming.textContent).toContain("Hosting this one");
    expect(upcoming.textContent).toContain("Going to this one");
    expect(within(upcoming).getAllByText("You're hosting")).toHaveLength(1);
  });

  it("says what goes there when the student is on no roster", () => {
    renderHome();
    expect(region("Your upcoming sessions").textContent).toContain(
      "Sessions you join or host show up here.",
    );
  });

  it("with no courses on the profile, shows one nudge instead of the course sections", () => {
    renderHome({ sessions: [session("x", "CS", "3251", "Somebody's session")] });

    expect(screen.getByRole("link", { name: "Add your courses" }).getAttribute("href")).toBe(
      "/profile",
    );
    expect(screen.queryByRole("region", { name: "In your courses" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Requests in your courses" })).toBeNull();
  });

  it("lists open sessions in the student's courses, leaving out other courses and what is already above", () => {
    const ownSession = session("own", "CS", "3251", "Already on my roster");
    const newOne = session("new", "CS", "3251", "Already under New");
    renderHome({
      courses: [{ departmentCode: "CS", number: "3251", title: null }],
      sessions: [
        ownSession,
        newOne,
        session("other", "CS", "3251", "Another CS 3251 session"),
        session("math", "MATH", "2300", "Not my course"),
      ],
      mine: [mine(ownSession, false)],
      newSessions: [
        {
          id: "new",
          topic: newOne.topic,
          course: newOne.course,
          startsAt: newOne.startsAt,
          endsAt: newOne.endsAt,
          locationLabel: newOne.locationLabel,
        },
      ],
    });

    const inCourses = region("In your courses").textContent ?? "";
    expect(inCourses).toContain("Another CS 3251 session");
    expect(inCourses).not.toContain("Not my course");
    expect(inCourses).not.toContain("Already on my roster");
    expect(inCourses).not.toContain("Already under New");
  });

  it("shows requests only for the student's courses, each with a prefilled \"Host one\"", () => {
    renderHome({
      courses: [{ departmentCode: "CS", number: "3251", title: null }],
      requests: [request("CS", "3251", 3, true), request("MATH", "2300", 5)],
    });

    const requests = region("Requests in your courses");
    expect(requests.textContent).toContain("3 students want a session, including you");
    expect(requests.textContent).not.toContain("MATH");
    expect(within(requests).getByRole("link", { name: "Host one" }).getAttribute("href")).toBe(
      "/sessions/new?department=CS&course=3251",
    );
  });

  it("lists past sessions with \"Host it again\", marking cancelled ones (US-15)", () => {
    renderHome({
      past: [past(session("p1", "CS", "3251", "Last week's review"), true)],
    });

    const pastRegion = region("Your past sessions");
    expect(pastRegion.textContent).toContain("Last week's review");
    expect(pastRegion.textContent).toContain("Cancelled");
    expect(
      within(pastRegion).getByRole("link", { name: "Host CS 3251 again" }).getAttribute("href"),
    ).toBe("/sessions/new?department=CS&course=3251");
  });

  it("leaves the past section out entirely when there is no history", () => {
    renderHome();
    expect(screen.queryByRole("region", { name: "Your past sessions" })).toBeNull();
  });

  it("says so when the session list failed, rather than claiming campus is empty", () => {
    renderHome({ sessions: null });
    expect(screen.getByText(/Sessions couldn't load/)).toBeTruthy();
  });
});
