import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessage } from "@/app/sessions/actions";
import type { ChatMessage } from "@/lib/chat";
import { subscribeToChat } from "@/lib/live-roster";

import SessionChat, { type SessionChatProps } from "./SessionChat";

// The real action is a "use server" module that imports server-only code;
// what the database allows is tested in tests/db/session-chat.test.ts.
vi.mock("@/app/sessions/actions", () => ({ sendMessage: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// The subscription itself is tested in src/lib/live-roster.test.ts.
const stopListening = vi.hoisted(() => vi.fn());
vi.mock("@/lib/live-roster", () => ({ subscribeToChat: vi.fn(() => stopListening) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => "browser-client" }));

const sendMock = vi.mocked(sendMessage);
const subscribeMock = vi.mocked(subscribeToChat);

const SESSION = "11111111-1111-4111-8111-111111111111";
// 18:00 UTC is noon in Nashville (CST).
const NOW = "2026-11-11T18:00:00.000Z";

const messages: ChatMessage[] = [
  {
    id: "m1",
    authorId: "host",
    authorDisplayName: "Priya",
    body: "Table by the window",
    createdAt: "2026-11-11T17:30:00Z",
  },
  { id: "m2", authorId: "me", authorDisplayName: "Alex", body: "On my way", createdAt: "2026-11-11T17:45:00Z" },
  { id: "m3", authorId: null, authorDisplayName: null, body: "Old news", createdAt: "2026-11-10T20:00:00Z" },
];

function renderChat(overrides: Partial<SessionChatProps> = {}) {
  return render(
    <SessionChat
      sessionId={SESSION}
      viewerId="me"
      access="open"
      messages={messages}
      now={NOW}
      {...overrides}
    />,
  );
}

const plain = (text: string | null) => (text ?? "").replace(/\s+/g, " ");

beforeEach(() => {
  sendMock.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SessionChat", () => {
  it("shows each message with its sender and campus time, in a polite log", () => {
    renderChat();

    const log = screen.getByRole("log", { name: "Chat" });
    expect(log.getAttribute("aria-live")).toBe("polite");
    const items = within(log).getAllByRole("listitem").map((item) => plain(item.textContent));
    // textContent runs the header and the bubble together.
    expect(items).toEqual([
      "Priya · 11:30 AMTable by the window",
      "You · 11:45 AMOn my way",
      "Deleted user · Yesterday, 2:00 PMOld news",
    ]);
    expect(screen.getByText("11:30 AM").closest("time")?.getAttribute("dateTime")).toBe(
      "2026-11-11T17:30:00Z",
    );
  });

  it("says so when nobody has posted yet", () => {
    renderChat({ messages: [] });
    expect(screen.getByText("No messages yet. Say hello to the group.")).toBeTruthy();
  });

  it("offers a 44px send form with a text-base message box, limited to 1000 characters", () => {
    renderChat();

    const box = screen.getByRole("textbox", { name: "Message" });
    expect(box.getAttribute("name")).toBe("body");
    expect(box.getAttribute("maxLength")).toBe("1000");
    expect(box.className).toContain("text-base");
    expect(box.className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Send" }).className).toContain("min-h-11");
  });

  it("sends the message to this session's action", async () => {
    renderChat();

    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Coming" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const [sessionId, , formData] = sendMock.mock.calls[0];
    expect(sessionId).toBe(SESSION);
    expect((formData as FormData).get("body")).toBe("Coming");
  });

  it("sends on Enter, but not on Shift+Enter", async () => {
    renderChat();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "Coming" } });

    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    });
    expect(sendMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("shows a refusal and keeps what was typed", () => {
    renderChat({
      initialState: { formError: "You can't post here.", values: { body: "Still there?" } },
    });

    expect(screen.getByRole("alert").textContent).toBe("You can't post here.");
    const box = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    expect(box.value).toBe("Still there?");
    expect(box.getAttribute("aria-invalid")).toBe("true");
  });

  it("listens while open, and refreshes the page on a new message", () => {
    const { unmount } = renderChat();

    expect(subscribeMock).toHaveBeenCalledWith("browser-client", SESSION, expect.any(Function));
    subscribeMock.mock.calls[0][2]();
    expect(router.refresh).toHaveBeenCalledTimes(1);

    unmount();
    expect(stopListening).toHaveBeenCalledTimes(1);
  });

  it("is read-only once closed: the transcript, no form, no listening", () => {
    renderChat({ access: "closed" });

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("This chat is read-only now.")).toBeTruthy();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("shows a non-attendee a prompt instead of the transcript (US-05b)", () => {
    renderChat({ access: "hidden", messages: [], joinable: true });

    expect(screen.getByText("Join to see the chat.")).toBeTruthy();
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it("does not tell a non-attendee to join a session they cannot join", () => {
    renderChat({ access: "hidden", messages: [], joinable: false });
    expect(screen.getByText("Only people going to this session can see its chat.")).toBeTruthy();
  });
});
