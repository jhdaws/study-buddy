import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { blockUser, unblockUser } from "@/app/blocks/actions";

import BlockButton from "./BlockButton";

// The real actions are a "use server" module that imports server-only code;
// what they do is in src/app/blocks/actions.test.ts, and the database's
// rules in tests/db/blocks.test.ts.
vi.mock("@/app/blocks/actions", () => ({ blockUser: vi.fn(), unblockUser: vi.fn() }));
const blockMock = vi.mocked(blockUser);
const unblockMock = vi.mocked(unblockUser);

const SAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("BlockButton", () => {
  it("shows Block when not blocked, and calls blockUser with the attendee's id", async () => {
    blockMock.mockResolvedValue({});
    render(<BlockButton userId={SAM} displayName="Sam" isBlocked={false} />);

    expect(screen.getByRole("button", { name: "Block Sam" })).toBeTruthy();
    await click("Block Sam");

    expect(blockMock).toHaveBeenCalledWith(SAM, {}, expect.any(FormData));
    expect(unblockMock).not.toHaveBeenCalled();
  });

  it("shows Unblock when already blocked, and calls unblockUser", async () => {
    unblockMock.mockResolvedValue({});
    render(<BlockButton userId={SAM} displayName="Sam" isBlocked />);

    expect(screen.getByRole("button", { name: "Unblock Sam" })).toBeTruthy();
    await click("Unblock Sam");

    expect(unblockMock).toHaveBeenCalledWith(SAM, {}, expect.any(FormData));
    expect(blockMock).not.toHaveBeenCalled();
  });

  it("names a profile with no name yet generically", () => {
    render(<BlockButton userId={SAM} displayName={null} isBlocked={false} />);
    expect(screen.getByRole("button", { name: "Block this student" })).toBeTruthy();
  });

  it("shows the database's refusal", async () => {
    blockMock.mockResolvedValue({ error: "You can't block yourself." });
    render(<BlockButton userId={SAM} displayName="Sam" isBlocked={false} />);

    await click("Block Sam");

    expect((await screen.findByRole("alert")).textContent).toBe("You can't block yourself.");
  });
});
