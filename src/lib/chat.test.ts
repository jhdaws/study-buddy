import { describe, expect, it } from "vitest";

import { chatAccess } from "./chat";

// What the session page offers in its chat panel (US-05). The database's own
// rules -- the same three outcomes, enforced -- are tested in
// tests/db/session-chat.test.ts.

const NOW = new Date("2026-11-11T18:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const session = (overrides: Partial<Parameters<typeof chatAccess>[0]> = {}) => ({
  status: "open" as const,
  endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  attendees: [
    { userId: "host", displayName: "Priya", isHost: true },
    { userId: "me", displayName: "Alex", isHost: false },
  ],
  ...overrides,
});

describe("chatAccess", () => {
  it("is open to the host and to a guest on the roster", () => {
    expect(chatAccess(session(), "host", NOW)).toBe("open");
    expect(chatAccess(session(), "me", NOW)).toBe("open");
  });

  it("is hidden from anyone not on the roster, whatever the session's state", () => {
    expect(chatAccess(session(), "stranger", NOW)).toBe("hidden");
    expect(chatAccess(session({ status: "cancelled" }), "stranger", NOW)).toBe("hidden");
  });

  it("is closed once the session is cancelled", () => {
    expect(chatAccess(session({ status: "cancelled" }), "me", NOW)).toBe("closed");
  });

  it("stays open until exactly a week after the end, then closes", () => {
    const endedAt = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

    expect(chatAccess(session({ endsAt: endedAt(6 * DAY) }), "me", NOW)).toBe("open");
    expect(chatAccess(session({ endsAt: endedAt(7 * DAY - 1) }), "me", NOW)).toBe("open");
    expect(chatAccess(session({ endsAt: endedAt(7 * DAY) }), "me", NOW)).toBe("closed");
  });
});
