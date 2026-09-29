import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSession, type CreateSessionState } from "@/app/sessions/actions";
import { fetchCourseSuggestions } from "@/lib/course-search";
import { fixtureDepartments } from "@/lib/fixtures";
import type { CourseSuggestion } from "@/lib/sessions";
import { formValues } from "@/lib/validation";

import CreateSessionForm from "./CreateSessionForm";

// The real action is a "use server" module that imports server-only code;
// the real typeahead helper calls fetch(). Both are replaced so the form can
// be driven in jsdom.
vi.mock("@/app/sessions/actions", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/course-search", () => ({ fetchCourseSuggestions: vi.fn() }));

const createSessionMock = vi.mocked(createSession);
const fetchSuggestionsMock = vi.mocked(fetchCourseSuggestions);

const departments = fixtureDepartments(); // CHEM, CS, ECON, MATH, PHYS

beforeEach(() => {
  // The form reads and shows campus (Nashville) time whatever the device's
  // zone is. Run in a far-away zone so a regression to device time fails.
  vi.stubEnv("TZ", "Asia/Tokyo");
  fetchSuggestionsMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

function form(): HTMLFormElement {
  return document.querySelector("form")!;
}

function submitted(): FormData {
  return new FormData(form());
}

function field(label: RegExp | string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

function change(element: HTMLElement, value: string) {
  fireEvent.change(element, { target: { value } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /create session/i }));
  });
}

/** The field's input is invalid and points at an alert carrying `message`. */
function expectFieldError(input: HTMLElement, message: string) {
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const describedBy = (input.getAttribute("aria-describedby") ?? "").split(" ");
  const alert = describedBy
    .map((id) => document.getElementById(id))
    .find((element) => element?.getAttribute("role") === "alert");
  expect(alert?.textContent).toBe(message);
}

const COURSE_LABEL = "Course number";

describe("<CreateSessionForm> errors and values", () => {
  it("renders each field error beside its input, linked for assistive technology", () => {
    const state: CreateSessionState = {
      fieldErrors: {
        departmentCode: ["Choose or add a department."],
        courseNumber: ["Enter a course number."],
        topic: ["Say what you'll be studying."],
        placeId: ["Choose a location."],
        locationLabel: ["Give the location a name."],
        room: ["Keep the room to 50 characters or fewer."],
        startsAt: ["The start time has already passed."],
        endsAt: ["The end time must be after the start time."],
        capacity: ["At least 2 — you count as one."],
      },
      formError: "Something went wrong saving the session.",
      values: {},
    };
    render(<CreateSessionForm departments={departments} initialState={state} />);

    expectFieldError(field("Department"), "Choose or add a department.");
    expectFieldError(field(COURSE_LABEL), "Enter a course number.");
    expectFieldError(field("What are you studying?"), "Say what you'll be studying.");
    expectFieldError(field("Place"), "Choose a location.");
    expectFieldError(field("Location name"), "Give the location a name.");
    expectFieldError(field(/^Room/), "Keep the room to 50 characters or fewer.");
    expectFieldError(field("Starts"), "The start time has already passed.");
    expectFieldError(field("Ends"), "The end time must be after the start time.");
    expectFieldError(field("How many people, including you?"), "At least 2 — you count as one.");

    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toContain("Something went wrong saving the session.");
    expect(alerts).toContain("Check the 9 fields marked above.");
  });

  it("keeps hints linked and marks nothing invalid when there are no errors", () => {
    render(<CreateSessionForm departments={departments} />);

    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    const course = field(COURSE_LABEL);
    expect(course.getAttribute("aria-invalid")).toBeNull();
    expect(document.getElementById(course.getAttribute("aria-describedby")!)?.textContent).toMatch(
      /Like 3251/,
    );
  });

  it("restores submitted values from the state", () => {
    const state: CreateSessionState = {
      fieldErrors: { topic: ["Say what you'll be studying."] },
      values: {
        departmentCode: "MATH",
        courseNumber: "2410",
        topic: "",
        room: "Group study room 3",
        placeId: "ChIJ-FAKE-central-library",
        locationLabel: "Library, 3rd floor",
        startsAt: "2026-10-01T19:30:00.000Z",
        endsAt: "2026-10-01T21:00:00.000Z",
        capacity: "3",
      },
    };
    render(<CreateSessionForm departments={departments} initialState={state} />);

    expect(field("Department").value).toBe("MATH");
    expect(field(COURSE_LABEL).value).toBe("2410");
    expect(field(/^Room/).value).toBe("Group study room 3");
    expect(field("Place").value).toBe("ChIJ-FAKE-central-library");
    expect(field("Location name").value).toBe("Library, 3rd floor");
    expect(field("Starts").value).toBe("2026-10-01T14:30"); // campus/browser time
    expect(field("Ends").value).toBe("2026-10-01T16:00");
    expect(field("How many people, including you?").value).toBe("3");

    const data = submitted();
    expect(data.get("departmentCode")).toBe("MATH");
    expect(data.get("placeId")).toBe("ChIJ-FAKE-central-library");
    expect(data.get("startsAt")).toBe("2026-10-01T19:30:00.000Z");
    expect(data.get("endsAt")).toBe("2026-10-01T21:00:00.000Z");
  });

  it("keeps everything the host entered across failed submits, the department select included", async () => {
    // The action refuses every time, the way createSession does on a
    // validation error: field errors plus the submitted values.
    createSessionMock.mockImplementation(async (_prev, formData) => ({
      fieldErrors: { topic: ["Say what you'll be studying."] },
      values: formValues(formData),
    }));
    render(<CreateSessionForm departments={departments} />);

    change(field("Department"), "CS");
    change(field(COURSE_LABEL), "3251");
    change(field("Place"), "ChIJ-FAKE-central-library");
    change(field(/^Room/), "Room 204");
    change(field("Starts"), "2026-10-01T14:30");
    change(field("Ends"), "2026-10-01T16:30");
    change(field("How many people, including you?"), "4");

    const expected = {
      departmentCode: "CS",
      courseNumber: "3251",
      topic: "",
      room: "Room 204",
      placeId: "ChIJ-FAKE-central-library",
      locationLabel: "Central Library",
      startsAt: "2026-10-01T19:30:00.000Z",
      endsAt: "2026-10-01T21:30:00.000Z",
      capacity: "4",
    };

    // Twice: after the first failure the form has been reset once already,
    // and the second must not undo what the first restored.
    for (let attempt = 1; attempt <= 2; attempt++) {
      await submit();

      expect(createSessionMock).toHaveBeenCalledTimes(attempt);
      expectFieldError(field("What are you studying?"), "Say what you'll be studying.");
      expect(Object.fromEntries(submitted())).toEqual(expected);
      expect(field("Starts").value).toBe("2026-10-01T14:30");
    }
  });

  it("disables the button while the action runs", async () => {
    let finish: (state: CreateSessionState) => void = () => {};
    createSessionMock.mockImplementation(
      () => new Promise<CreateSessionState>((resolve) => (finish = resolve)),
    );
    render(<CreateSessionForm departments={departments} />);

    await submit();
    const button = screen.getByRole("button", { name: "Creating session…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    await act(async () => finish({}));
    expect((screen.getByRole("button", { name: "Create session" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("<CreateSessionForm> fields", () => {
  it("swaps in a text input for a new department, submitted as departmentCode", () => {
    render(<CreateSessionForm departments={departments} />);
    expect(screen.queryByLabelText("New department code")).toBeNull();

    change(field("Department"), "__add__");
    change(field("New department code"), "BME");

    // Only the text input is submitted; the select has no name while adding.
    expect(submitted().getAll("departmentCode")).toEqual(["BME"]);
  });

  it("reopens in 'add' mode when the submitted department is not in the list", () => {
    render(
      <CreateSessionForm
        departments={departments}
        initialState={{ values: { departmentCode: "BME" } }}
      />,
    );
    expect(field("Department").value).toBe("__add__");
    expect(field("New department code").value).toBe("BME");
  });

  it("prefills the location name from the picker, but never over the host's own", () => {
    render(<CreateSessionForm departments={departments} />);
    const label = field("Location name");

    change(field("Place"), "ChIJ-FAKE-featheringill-hall");
    expect(label.value).toBe("Featheringill Hall");

    change(label, "Featheringill, 2nd floor");
    change(field("Place"), "ChIJ-FAKE-central-library");
    expect(label.value).toBe("Featheringill, 2nd floor");

    // Emptying it hands it back to the picker.
    change(label, "");
    change(field("Place"), "ChIJ-FAKE-central-library");
    change(field("Place"), "ChIJ-FAKE-hillsboro-village-cafe");
    expect(label.value).toBe("Hillsboro Village café");
  });

  it("submits the times as ISO instants, never the raw local values", () => {
    render(<CreateSessionForm departments={departments} />);

    change(field("Starts"), "2026-12-01T09:00");
    change(field("Ends"), "2026-12-01T11:00");

    const data = submitted();
    // December: standard time, UTC-6.
    expect(data.get("startsAt")).toBe("2026-12-01T15:00:00.000Z");
    expect(data.get("endsAt")).toBe("2026-12-01T17:00:00.000Z");
    expect([...data.values()]).not.toContain("2026-12-01T09:00");
  });
});

describe("<CreateSessionForm> course typeahead", () => {
  const suggestions: CourseSuggestion[] = [
    { id: "c1", departmentCode: "CS", number: "3251", title: "Intermediate Software Design", sessionCount: 2 },
    { id: "c2", departmentCode: "CS", number: "2201", title: "Program Design and Data Structures", sessionCount: 0 },
  ];

  it("suggests courses in the chosen department with how often each was used", async () => {
    fetchSuggestionsMock.mockResolvedValue(suggestions);
    render(<CreateSessionForm departments={departments} />);

    change(field("Department"), "CS");
    change(field(COURSE_LABEL), "3");

    const option = await screen.findByRole("option", { name: /CS 3251/ });
    expect(option.textContent).toMatch(/Intermediate Software Design/);
    expect(option.textContent).toMatch(/2 sessions/);
    expect(screen.getByRole("option", { name: /CS 2201/ }).textContent).toMatch(/No sessions yet/);
    expect(fetchSuggestionsMock).toHaveBeenLastCalledWith("CS", "3", expect.anything());

    fireEvent.click(option);
    expect(field(COURSE_LABEL).value).toBe("3251");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks a suggestion with the arrow keys and Enter", async () => {
    fetchSuggestionsMock.mockResolvedValue(suggestions);
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "CS");
    const input = field(COURSE_LABEL);
    change(input, "2");
    await screen.findByRole("listbox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: /CS 2201/ }).id,
    );
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("2201");
  });

  it("offers to create a course nobody has studied yet", async () => {
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "CS");
    change(field(COURSE_LABEL), "9999");

    const option = await screen.findByRole("option", {
      name: "Nobody's studied CS 9999 yet — create it?",
    });
    fireEvent.click(option);
    expect(field(COURSE_LABEL).value).toBe("9999");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("looks courses up in a department the host is adding", async () => {
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "__add__");
    change(field("New department code"), "BME");
    change(field(COURSE_LABEL), "1000");

    await screen.findByRole("option", { name: /Nobody's studied BME 1000 yet/ });
    expect(fetchSuggestionsMock).toHaveBeenLastCalledWith("BME", "1000", expect.anything());
  });

  it("does not look anything up before a department is chosen", async () => {
    render(<CreateSessionForm departments={departments} />);
    change(field(COURSE_LABEL), "3251");

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchSuggestionsMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("cancels the previous lookup when the host keeps typing", async () => {
    // Never answers, so the first request is still in flight.
    fetchSuggestionsMock.mockImplementation(() => new Promise(() => {}));
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "CS");
    const input = field(COURSE_LABEL);

    change(input, "3");
    await waitFor(() => expect(fetchSuggestionsMock).toHaveBeenCalledTimes(1));
    const firstSignal = fetchSuggestionsMock.mock.calls[0][2]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    change(input, "32");
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(fetchSuggestionsMock).toHaveBeenCalledTimes(2));
    expect(fetchSuggestionsMock.mock.calls[1].slice(0, 2)).toEqual(["CS", "32"]);
  });

  it("debounces: quick keystrokes send one request", async () => {
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "CS");
    const input = field(COURSE_LABEL);

    change(input, "3");
    change(input, "32");
    change(input, "325");
    await waitFor(() => expect(fetchSuggestionsMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetchSuggestionsMock).toHaveBeenCalledTimes(1);
    expect(fetchSuggestionsMock).toHaveBeenCalledWith("CS", "325", expect.anything());
  });

  it("stays usable when suggestions fail to load", async () => {
    fetchSuggestionsMock.mockRejectedValue(new Error("Course search failed with HTTP 500"));
    render(<CreateSessionForm departments={departments} />);
    change(field("Department"), "CS");
    act(() => field(COURSE_LABEL).focus());
    change(field(COURSE_LABEL), "3251");

    expect(await screen.findByText(/Suggestions aren.t available right now/)).toBeTruthy();
    expect(submitted().get("courseNumber")).toBe("3251");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
