import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { unblockUser } from "@/app/blocks/actions";

import BlockedStudentsList from "./BlockedStudentsList";

// The real action is a "use server" module that imports server-only code;
// what it does is in src/app/blocks/actions.test.ts.
vi.mock("@/app/blocks/actions", () => ({ unblockUser: vi.fn() }));
const unblockMock = vi.mocked(unblockUser);

const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlockedStudentsList", () => {
  it("renders nothing when there are no blocks", () => {
    const { container } = render(<BlockedStudentsList blocks={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("lists each blocked student by name, or generically with none yet", () => {
    render(
      <BlockedStudentsList
        blocks={[
          { userId: SAM, displayName: "Sam" },
          { userId: LEE, displayName: null },
        ]}
      />,
    );

    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("A student")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Unblock" })).toHaveLength(2);
  });

  it("unblocks the right student", async () => {
    unblockMock.mockResolvedValue({});
    render(<BlockedStudentsList blocks={[{ userId: SAM, displayName: "Sam" }]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    });

    expect(unblockMock).toHaveBeenCalledWith(SAM, {}, expect.any(FormData));
  });

  it("shows the database's refusal", async () => {
    unblockMock.mockResolvedValue({ error: "Something went wrong on our side. Try again in a moment." });
    render(<BlockedStudentsList blocks={[{ userId: SAM, displayName: "Sam" }]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Something went wrong on our side. Try again in a moment.",
    );
  });
});
