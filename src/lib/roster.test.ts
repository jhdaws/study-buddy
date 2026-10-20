import { describe, expect, it } from "vitest";

import { rosterAction } from "./roster";

const HOST = "host";
const ME = "me";
const now = new Date("2026-10-01T20:00:00Z");

const session = (overrides: Partial<Parameters<typeof rosterAction>[0]> = {}) => ({
  status: "open" as const,
  endsAt: "2026-10-01T21:00:00Z",
  hostId: HOST,
  attendees: [{ userId: HOST, displayName: "Priya", isHost: true }],
  seatsLeft: 3,
  ...overrides,
});

const onRoster = [
  { userId: HOST, displayName: "Priya", isHost: true },
  { userId: ME, displayName: "Alex", isHost: false },
];

describe("rosterAction", () => {
  it("offers Join to a student not on the roster, with seats left", () => {
    expect(rosterAction(session(), ME, now)).toBe("join");
  });

  it("offers Leave to a student already on the roster", () => {
    expect(rosterAction(session({ attendees: onRoster }), ME, now)).toBe("leave");
  });

  it("says Full rather than offering Join when no seat is left (US-07)", () => {
    expect(rosterAction(session({ seatsLeft: 0 }), ME, now)).toBe("full");
  });

  it("still offers Leave on a full session the student is part of", () => {
    expect(rosterAction(session({ seatsLeft: 0, attendees: onRoster }), ME, now)).toBe("leave");
  });

  it("tells the host they are hosting: they cannot leave, only cancel", () => {
    expect(rosterAction(session(), HOST, now)).toBe("hosting");
    expect(rosterAction(session({ seatsLeft: 0 }), HOST, now)).toBe("hosting");
  });

  it("offers nothing once the session has ended, to anyone", () => {
    const ended = session({ endsAt: "2026-10-01T20:00:00Z" });
    expect(rosterAction(ended, ME, now)).toBe("ended");
    expect(rosterAction(ended, HOST, now)).toBe("ended");
    expect(rosterAction({ ...ended, attendees: onRoster }, ME, now)).toBe("ended");
  });

  it("offers nothing on a cancelled session, even before its end time", () => {
    const cancelled = session({ status: "cancelled" });
    expect(rosterAction(cancelled, ME, now)).toBe("cancelled");
    expect(rosterAction(cancelled, HOST, now)).toBe("cancelled");
    expect(rosterAction({ ...cancelled, endsAt: "2026-10-01T19:00:00Z" }, ME, now)).toBe(
      "cancelled",
    );
  });

  it("treats a session whose host deleted their account as hosted by no one", () => {
    expect(rosterAction(session({ hostId: null }), ME, now)).toBe("join");
  });
});
