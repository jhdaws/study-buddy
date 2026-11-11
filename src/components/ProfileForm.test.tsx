import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveProfile, type ProfileState } from "@/app/profile/actions";
import { fetchCourseSuggestions } from "@/lib/course-search";
import { fixtureDepartments } from "@/lib/fixtures";

import ProfileForm, { type ProfileFormProps } from "./ProfileForm";

// The real action is a "use server" module that imports server-only code;
// the typeahead's helper calls fetch(). Both are replaced so the form runs in
// jsdom. What the action does with the submission is in
// src/app/profile/actions.test.ts.
vi.mock("@/app/profile/actions", () => ({ saveProfile: vi.fn() }));
vi.mock("@/lib/course-search", () => ({ fetchCourseSuggestions: vi.fn() }));

const saveMock = vi.mocked(saveProfile);

const SAVED: ProfileFormProps["profile"] = {
  major: "Computer Science",
  minor: null,
  classYear: "junior",
  courses: [{ departmentCode: "CS", number: "3251", title: "Intermediate Software Design" }],
};

function renderForm(overrides: Partial<ProfileFormProps> = {}) {
  render(<ProfileForm departments={fixtureDepartments()} profile={SAVED} {...overrides} />);
}

const form = () => document.querySelector("form")!;
const submitted = () => new FormData(form());
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const listed = () =>
  within(screen.getByRole("list", { name: "Your current courses" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent?.replace("Remove", ""));

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

function chooseDepartment(code: string) {
  const select = screen.getByLabelText("Department");
  // input then change, as a browser fires them (BUG-15).
  fireEvent.input(select, { target: { value: code } });
  fireEvent.change(select, { target: { value: code } });
}

function typeCourseNumber(value: string) {
  fireEvent.change(field("Course number"), { target: { value } });
}

beforeEach(() => {
  vi.mocked(fetchCourseSuggestions).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("<ProfileForm>", () => {
  it("shows what is saved, and submits it unchanged", () => {
    renderForm();

    expect(field("Major (optional)").value).toBe("Computer Science");
    expect(field("Minor (optional)").value).toBe("");
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("junior");
    expect(listed()).toEqual(["CS 3251"]);

    const data = submitted();
    expect(data.get("major")).toBe("Computer Science");
    expect(data.get("classYear")).toBe("junior");
    expect(data.getAll("courses")).toEqual(["CS 3251"]);
  });

  it("offers every year, and no year", () => {
    renderForm();
    const options = within(screen.getByLabelText("Year")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Prefer not to say",
      "First year",
      "Sophomore",
      "Junior",
      "Senior",
      "Graduate student",
    ]);
  });

  it("adds a course from the department and number, and empties the number", async () => {
    renderForm();
    chooseDepartment("MATH");
    typeCourseNumber("2300 ");
    await click("Add course");

    expect(listed()).toEqual(["CS 3251", "MATH 2300"]);
    expect(submitted().getAll("courses")).toEqual(["CS 3251", "MATH 2300"]);
    expect(field("Course number").value).toBe("");
  });

  it("does not list the same course twice", async () => {
    renderForm();
    chooseDepartment("CS");
    typeCourseNumber("3251");
    await click("Add course");
    expect(listed()).toEqual(["CS 3251"]);
  });

  it.each([
    ["no department", "", "3251", "Choose the course's department first."],
    ["a malformed number", "CS", "32", "Enter a 4-digit course number, like 3251 or 2100W."],
  ])("explains %s instead of adding it", async (_label, department, number, message) => {
    renderForm();
    if (department) chooseDepartment(department);
    typeCourseNumber(number);
    await click("Add course");

    expect(listed()).toEqual(["CS 3251"]);
    const input = field("Course number");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe(
      message,
    );
  });

  it("removes a course", async () => {
    renderForm();
    await click("Remove CS 3251");
    expect(screen.getByText("No courses listed yet.")).toBeTruthy();
    expect(submitted().getAll("courses")).toEqual([]);
  });

  it("stops adding at the limit", () => {
    renderForm({
      profile: {
        ...SAVED,
        courses: Array.from({ length: 8 }, (_, i) => ({
          departmentCode: "CS",
          number: String(3000 + i),
          title: null,
        })),
      },
    });
    expect((screen.getByRole("button", { name: "Add course" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/most a profile lists/)).toBeTruthy();
  });

  it("renders the server's field and form errors", () => {
    const initialState: ProfileState = {
      fieldErrors: {
        major: ["Keep your major to 80 characters or fewer."],
        courses: ["“CS 32” isn't a course number. Use 4 digits, like 3251 or 2100W."],
      },
      formError: "Something went wrong on our side. Try again in a moment.",
      values: { major: "x".repeat(81) },
    };
    renderForm({ initialState });

    const major = field("Major (optional)");
    expect(major.value).toBe("x".repeat(81));
    expect(major.getAttribute("aria-invalid")).toBe("true");
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual([
      "Keep your major to 80 characters or fewer.",
      "“CS 32” isn't a course number. Use 4 digits, like 3251 or 2100W.",
      "Something went wrong on our side. Try again in a moment.",
    ]);
  });

  it("after a save, says so and shows the server's normalised list", async () => {
    saveMock.mockResolvedValue({
      saved: true,
      values: { major: "Computer Science", minor: "", classYear: "senior" },
      courses: ["CS 3251", "MATH 2300"],
    });
    renderForm();
    chooseDepartment("MATH");
    typeCourseNumber("2300");
    await click("Save profile");

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Profile saved.");
    expect(listed()).toEqual(["CS 3251", "MATH 2300"]);
    // The add row was saved along with the rest, so it is emptied.
    expect(field("Course number").value).toBe("");
    expect((screen.getByLabelText("Department") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("senior");
  });

  it("submits a course typed but never added, along with the list", async () => {
    saveMock.mockResolvedValue({ formError: "nope" });
    renderForm();
    chooseDepartment("PHYS");
    typeCourseNumber("1601L");
    await click("Save profile");

    const data = saveMock.mock.calls[0][1];
    expect(data.get("courseDepartment")).toBe("PHYS");
    expect(data.get("courseNumber")).toBe("1601L");
    expect(data.getAll("courses")).toEqual(["CS 3251"]);
  });

  it("is mobile first: 44px controls and text-base inputs (ADR 0004)", () => {
    renderForm();
    for (const label of ["Major (optional)", "Minor (optional)", "Year", "Department", "Course number"]) {
      const control = screen.getByLabelText(label);
      expect(control.className, label).toContain("text-base");
      expect(control.className, label).toContain("min-h-11");
    }
    for (const button of screen.getAllByRole("button")) {
      expect(button.className, button.textContent ?? "").toContain("min-h-11");
    }
  });
});
