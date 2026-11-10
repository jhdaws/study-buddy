import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requestSession, withdrawRequest } from "@/app/sessions/actions";
import type { Department } from "@/lib/sessions";
import type { StudyRequestGroup } from "@/lib/study-requests";

import StudyRequests from "./StudyRequests";

// The real actions are a "use server" module importing server-only code; what
// they do to the database is tested in tests/db/study-requests.test.ts and
// src/app/sessions/actions.test.ts. The typeahead would fetch, so it is
// replaced by a plain input with the same name -- the schema key is the
// contract between the two (src/lib/validation.ts).
vi.mock("@/app/sessions/actions", () => ({
  requestSession: vi.fn(),
  withdrawRequest: vi.fn(),
}));
vi.mock("@/components/CourseNumberInput", () => ({
  default: ({ id, defaultValue }: { id: string; defaultValue?: string }) => (
    <input id={id} name="courseNumber" defaultValue={defaultValue} />
  ),
}));

const requestMock = vi.mocked(requestSession);
const withdrawMock = vi.mocked(withdrawRequest);

const departments: Department[] = [
  { code: "CS", name: "Computer Science" },
  { code: "MATH", name: "Mathematics" },
];

const group = (overrides: Partial<StudyRequestGroup> = {}): StudyRequestGroup => ({
  courseId: "course-cs-3251",
  course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
  count: 3,
  viewerAsked: false,
  viewerRequestId: null,
  notes: [],
  ...overrides,
});

function renderRequests(requests: StudyRequestGroup[] = [group()]) {
  render(<StudyRequests requests={requests} departments={departments} />);
}

async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  requestMock.mockResolvedValue({});
  withdrawMock.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  requestMock.mockReset();
  withdrawMock.mockReset();
});

describe("StudyRequests: the waiting list", () => {
  it("says how many students want a course", () => {
    renderRequests();

    expect(screen.getByText(/3 students want/).textContent).toContain("CS 3251");
  });

  it("uses the singular for one student", () => {
    renderRequests([group({ count: 1 })]);

    expect(screen.getByText(/1 student wants/)).toBeTruthy();
    expect(screen.queryByText(/1 students/)).toBeNull();
  });

  it("shows the course title when there is one", () => {
    renderRequests();

    expect(screen.getByText(/Intermediate Software Design/)).toBeTruthy();
  });

  it("renders without a title, since titles are optional", () => {
    renderRequests([
      group({ course: { departmentCode: "MATH", number: "2410", title: null } }),
    ]);

    expect(screen.getByText(/students want/).textContent).toContain("MATH 2410");
  });

  // The whole point of the feature: turning "someone wants this" into a
  // hosted session, without making the host retype the course.
  it("links Host one straight to a prefilled create form", () => {
    renderRequests();

    const link = screen.getByRole("link", { name: "Host one" });
    expect(link.getAttribute("href")).toBe("/sessions/new?department=CS&course=3251");
  });

  it("shows the notes students left", () => {
    renderRequests([group({ notes: ["Tue evening", "Before the midterm"] })]);

    expect(screen.getByText(/Tue evening/)).toBeTruthy();
    expect(screen.getByText(/Before the midterm/)).toBeTruthy();
  });

  it("offers Withdraw only on the viewer's own ask", () => {
    renderRequests([group({ viewerAsked: true, viewerRequestId: "req-1" })]);

    expect(screen.getByRole("button", { name: "Withdraw" })).toBeTruthy();
  });

  it("offers no Withdraw on a classmate's ask", () => {
    renderRequests();

    expect(screen.queryByRole("button", { name: "Withdraw" })).toBeNull();
  });

  it("still invites a request when nobody has asked yet", () => {
    renderRequests([]);

    // A student whose course is missing needs this most when the list is
    // empty, so the section never hides itself.
    expect(screen.getByRole("button", { name: "Request a session" })).toBeTruthy();
  });
});

describe("StudyRequests: withdrawing", () => {
  it("withdraws the viewer's own request by its id", async () => {
    renderRequests([group({ viewerAsked: true, viewerRequestId: "req-1" })]);

    await click("Withdraw");

    // Bound to the VIEWER's request id, which is what keeps one student from
    // withdrawing another's even before RLS is consulted.
    expect(withdrawMock).toHaveBeenCalled();
    expect(withdrawMock.mock.calls[0][0]).toBe("req-1");
  });

  it("shows a refusal next to the request it belongs to", async () => {
    withdrawMock.mockResolvedValue({ error: "That request isn't there anymore." });
    renderRequests([group({ viewerAsked: true, viewerRequestId: "req-1" })]);

    await click("Withdraw");

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("That request isn't there anymore.");
    // Named, because several rows can each have their own failure.
    expect(alert.textContent).toContain("CS 3251");
  });
});

describe("StudyRequests: asking", () => {
  it("keeps the form out of the way until it is wanted", () => {
    renderRequests();

    expect(screen.queryByLabelText("Department")).toBeNull();
  });

  it("opens the form on request", async () => {
    renderRequests();

    await click("Request a session");

    expect(screen.getByLabelText("Department")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Post request" })).toBeTruthy();
  });

  it("offers every department", async () => {
    renderRequests();
    await click("Request a session");

    const select = screen.getByLabelText("Department");
    const options = within(select).getAllByRole("option");
    expect(options.map((option) => option.getAttribute("value"))).toEqual(["", "CS", "MATH"]);
  });

  it("caps the note in the browser as well as the schema", async () => {
    renderRequests();
    await click("Request a session");

    // maxLength from @/lib/limits, so the browser stops at the same place the
    // schema and the CHECK do.
    expect(screen.getByLabelText(/Note/).getAttribute("maxLength")).toBe("200");
  });

  it("can be closed again", async () => {
    renderRequests();
    await click("Request a session");

    await click("Cancel");

    expect(screen.queryByLabelText("Department")).toBeNull();
  });

  it("shows a field error against the field", async () => {
    requestMock.mockResolvedValue({
      fieldErrors: { courseNumber: ["Enter a 4-digit course number, like 3251 or 2100W."] },
      values: { departmentCode: "CS" },
    });
    renderRequests();
    await click("Request a session");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post request" }));
    });

    expect(screen.getByRole("alert").textContent).toContain("Enter a 4-digit course number");
  });

  it("shows a form-level error", async () => {
    requestMock.mockResolvedValue({
      formError: "You've already asked for this course. Classmates can see it.",
    });
    renderRequests();
    await click("Request a session");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post request" }));
    });

    expect(screen.getByRole("alert").textContent).toContain("You've already asked");
  });

  it("closes the form once the ask is posted", async () => {
    // Success returns `{}`, the same shape as the starting state -- the form
    // must close on "was pending, now clean", not on emptiness alone.
    requestMock.mockResolvedValue({});
    renderRequests();
    await click("Request a session");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post request" }));
    });

    expect(screen.queryByLabelText("Department")).toBeNull();
    expect(screen.getByRole("button", { name: "Request a session" })).toBeTruthy();
  });

  it("keeps the form open when the ask is refused", async () => {
    requestMock.mockResolvedValue({
      formError: "You've already asked for this course. Classmates can see it.",
    });
    renderRequests();
    await click("Request a session");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Post request" }));
    });

    expect(screen.getByLabelText("Department")).toBeTruthy();
  });
});
