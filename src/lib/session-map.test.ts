// @vitest-environment node

import { describe, expect, it } from "vitest";

import { fixtureSessionList } from "./fixtures";
import { sessionPins, sessionView } from "./session-map";
import type { SessionListItem } from "./sessions";

// Thursday 1 Oct 2026, 10 AM in Nashville.
const NOW = new Date("2026-10-01T15:00:00Z");

const FEATHERINGILL = { lat: 36.1445, lng: -86.8035 };
const LIBRARY = { lat: 36.1452, lng: -86.8006 };

function session(overrides: Partial<SessionListItem> = {}): SessionListItem {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
    topic: "Design patterns review",
    locationLabel: "Featheringill Hall",
    room: "2nd floor study area",
    ...FEATHERINGILL,
    // 2 PM - 4 PM in Nashville.
    startsAt: "2026-10-01T19:00:00.000Z",
    endsAt: "2026-10-01T21:00:00.000Z",
    capacity: 4,
    attendeeCount: 2,
    seatsLeft: 2,
    hostDisplayName: "Priya",
    ...overrides,
  };
}

const plain = (text: string) => text.replace(/\s+/g, " ");

describe("sessionView -- the List / Map toggle's ?view=", () => {
  it("is the map only when asked for by name", () => {
    expect(sessionView("map")).toBe("map");
  });

  it("defaults to the list for a missing, empty or unknown value (ADR 0004)", () => {
    for (const param of [null, undefined, "", "list", "MAP", "satellite"]) {
      expect(sessionView(param)).toBe("list");
    }
  });
});

describe("sessionPins", () => {
  it("turns one session into one pin with what its info window shows", () => {
    const pins = sessionPins([session()], NOW);
    // Intl puts thin spaces around the dash in a time range; compare with
    // plain ones, as format.test.ts does.
    pins[0].sessions[0].time = plain(pins[0].sessions[0].time);

    expect(pins).toEqual([
      {
        key: "36.14450,-86.80350",
        position: FEATHERINGILL,
        label: "Featheringill Hall",
        sessions: [
          {
            id: "30000000-0000-4000-8000-000000000001",
            href: "/sessions/30000000-0000-4000-8000-000000000001",
            courseCode: "CS 3251",
            courseTitle: "Intermediate Software Design",
            topic: "Design patterns review",
            startsAt: "2026-10-01T19:00:00.000Z",
            // Campus time, whatever the machine's zone: 19:00 UTC is 2 PM.
            time: "Today · 2:00 – 4:00 PM",
            seatsLeft: 2,
            where: "2nd floor study area",
          },
        ],
        full: false,
        title: "CS 3251 at Featheringill Hall, 2 seats left",
      },
    ]);
  });

  it("gives every place its own pin", () => {
    const pins = sessionPins(
      [session({ id: "a" }), session({ id: "b", locationLabel: "Central Library", ...LIBRARY })],
      NOW,
    );

    expect(pins.map((pin) => pin.position)).toEqual([FEATHERINGILL, LIBRARY]);
  });

  it("shares one pin between sessions at the same spot, so neither hides the other", () => {
    const pins = sessionPins(
      [
        session({ id: "first" }),
        session({ id: "elsewhere", locationLabel: "Central Library", ...LIBRARY }),
        session({ id: "second", topic: "Exam 2" }),
      ],
      NOW,
    );

    expect(pins).toHaveLength(2);
    expect(pins[0].sessions.map((item) => item.id)).toEqual(["first", "second"]);
    expect(pins[0].title).toBe("2 sessions at Featheringill Hall");
  });

  it("treats coordinates a few centimetres apart as one spot", () => {
    const pins = sessionPins(
      [session({ id: "a" }), session({ id: "b", lat: FEATHERINGILL.lat + 0.000_000_1 })],
      NOW,
    );

    expect(pins).toHaveLength(1);
  });

  it("keeps the list's order: pins by their soonest session", () => {
    const pins = sessionPins(
      [
        session({ id: "soon", locationLabel: "Central Library", ...LIBRARY }),
        session({ id: "later" }),
      ],
      NOW,
    );

    expect(pins.map((pin) => pin.label)).toEqual(["Central Library", "Featheringill Hall"]);
  });

  describe("full sessions", () => {
    it("marks a pin full when its only session has no seats", () => {
      const [pin] = sessionPins([session({ capacity: 3, attendeeCount: 3, seatsLeft: 0 })], NOW);

      expect(pin.full).toBe(true);
      expect(pin.title).toBe("CS 3251 at Featheringill Hall, Full");
    });

    it("does not mark a shared pin full while any session there has a seat", () => {
      const [pin] = sessionPins(
        [session({ id: "full", seatsLeft: 0 }), session({ id: "open", seatsLeft: 1 })],
        NOW,
      );

      expect(pin.full).toBe(false);
      expect(pin.title).toBe("2 sessions at Featheringill Hall, 1 full");
    });

    it("marks a shared pin full when every session there is", () => {
      const [pin] = sessionPins(
        [session({ id: "a", seatsLeft: 0 }), session({ id: "b", seatsLeft: 0 })],
        NOW,
      );

      expect(pin.full).toBe(true);
      expect(pin.title).toBe("2 sessions at Featheringill Hall, all full");
    });
  });

  describe("where, under the pin's heading", () => {
    it("is the room when the place is the heading", () => {
      const [pin] = sessionPins([session({ room: "Room 100" })], NOW);
      expect(pin.sessions[0].where).toBe("Room 100");
    });

    it("is nothing when there is no room and the place is the heading", () => {
      const [pin] = sessionPins([session({ room: null })], NOW);
      expect(pin.sessions[0].where).toBeNull();
    });

    it("is the host's own label, with the room, when it differs from the heading", () => {
      const [pin] = sessionPins(
        [
          session({ id: "a" }),
          session({ id: "b", locationLabel: "Featheringill, by the café", room: "Lobby" }),
          session({ id: "c", locationLabel: "Featheringill atrium", room: null }),
        ],
        NOW,
      );

      expect(pin.sessions.map((item) => item.where)).toEqual([
        "2nd floor study area",
        "Featheringill, by the café, Lobby",
        "Featheringill atrium",
      ]);
    });
  });

  it("leaves a session without real coordinates off the map, never at 0, 0", () => {
    const pins = sessionPins(
      [
        session({ id: "nan", lat: Number.NaN }),
        session({ id: "off the globe", lat: 91 }),
        session({ id: "ok", locationLabel: "Central Library", ...LIBRARY }),
      ],
      NOW,
    );

    expect(pins.map((pin) => pin.label)).toEqual(["Central Library"]);
  });

  it("returns no pins for no sessions", () => {
    expect(sessionPins([], NOW)).toEqual([]);
  });

  it("pins the fixture list: one shared pin, one full pin", () => {
    const list = fixtureSessionList(NOW);
    const pins = sessionPins(list, NOW);

    expect(pins.reduce((total, pin) => total + pin.sessions.length, 0)).toBe(list.length);
    expect(pins.some((pin) => pin.sessions.length > 1)).toBe(true);
    expect(pins.filter((pin) => pin.full)).toHaveLength(1);
  });
});
