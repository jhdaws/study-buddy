import { describe, expect, it } from "vitest";

import {
  buildSessionIcs,
  escapeIcsText,
  foldIcsLine,
  icsFileName,
  toIcsUtc,
} from "./ics";
import type { SessionListItem } from "./sessions";

const session: SessionListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
  topic: "Dynamic programming",
  locationLabel: "Central Library",
  room: "418",
  startsAt: "2026-10-01T19:30:00.000Z",
  endsAt: "2026-10-01T21:00:00.000Z",
  capacity: 6,
  attendeeCount: 3,
  seatsLeft: 3,
  hostDisplayName: "Priya",
};

const options = {
  sessionUrl: "https://study-buddy-jdaws.vercel.app/sessions/11111111-1111-4111-8111-111111111111",
  now: new Date("2026-09-30T12:00:00.000Z"),
};

const make = (overrides: Partial<SessionListItem> = {}) => ({ ...session, ...overrides });

/**
 * Undo RFC 5545 folding, the way a calendar app does before reading a file:
 * a CRLF followed by a single space is not a line break. Tests that care
 * about a property's *value* unfold first, so that folding can change
 * without rewriting them.
 */
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

const propertyLines = (ics: string) => unfold(ics).split("\r\n").filter(Boolean);

const property = (ics: string, name: string) =>
  propertyLines(ics).find((line) => line.startsWith(`${name}:`));

describe("escapeIcsText", () => {
  it("escapes the four characters RFC 5545 reserves in TEXT", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
  });

  it("escapes the backslash first, so added escapes are not re-escaped", () => {
    // Naively replacing "," before "\" would turn this into "a\\\,b": a
    // literal backslash followed by an escaped comma, which is not the input.
    expect(escapeIcsText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("turns every flavour of line break into \\n", () => {
    expect(escapeIcsText("a\r\nb\nc\rd")).toBe("a\\nb\\nc\\nd");
  });

  it("leaves the colon alone, so URLs survive", () => {
    expect(escapeIcsText("https://example.edu/x")).toBe("https://example.edu/x");
  });
});

describe("toIcsUtc", () => {
  it("writes a UTC date-time with no dashes, colons or milliseconds", () => {
    expect(toIcsUtc("2026-10-01T19:30:00.000Z")).toBe("20261001T193000Z");
  });

  it("converts an offset instant to UTC rather than keeping local digits", () => {
    expect(toIcsUtc("2026-10-01T14:30:00-05:00")).toBe("20261001T193000Z");
  });

  it("refuses a value that is not a date", () => {
    expect(() => toIcsUtc("not a date")).toThrow(RangeError);
  });
});

describe("foldIcsLine", () => {
  const octets = (text: string) => new TextEncoder().encode(text).length;

  it("leaves a line at the limit alone", () => {
    const line = "X".repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("folds a longer line, continuing with a leading space", () => {
    const folded = foldIcsLine("X".repeat(80));
    expect(folded).toBe(`${"X".repeat(75)}\r\n ${"X".repeat(5)}`);
  });

  it("keeps every folded line inside 75 octets, counting the leading space", () => {
    for (const line of foldIcsLine("Y".repeat(500)).split("\r\n")) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
  });

  it("never splits a multi-byte character across a fold", () => {
    // "é" is two octets, so a fold that counted characters would land in the
    // middle of one and produce invalid UTF-8.
    const folded = foldIcsLine("é".repeat(80));
    for (const line of folded.split("\r\n")) {
      expect(octets(line)).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe("é".repeat(80));
  });

  it("never splits an emoji, which is a surrogate pair in JS", () => {
    const folded = foldIcsLine(`${"a".repeat(74)}${"🎓".repeat(4)}`);
    expect(unfold(folded)).toBe(`${"a".repeat(74)}${"🎓".repeat(4)}`);
    expect(folded).not.toContain("\uFFFD");
  });

  it("round-trips: unfolding returns exactly the input", () => {
    const line = `SUMMARY:${"long ".repeat(60)}`;
    expect(unfold(foldIcsLine(line))).toBe(line);
  });
});

describe("buildSessionIcs", () => {
  it("wraps a single event in a calendar", () => {
    const lines = propertyLines(buildSessionIcs(session, options));

    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines).toContain("VERSION:2.0");
    expect(lines.some((line) => line.startsWith("PRODID:"))).toBe(true);
  });

  it("ends every line with CRLF, including the last", () => {
    const ics = buildSessionIcs(session, options);

    expect(ics.endsWith("\r\n")).toBe(true);
    // A bare LF anywhere means a line ended without its carriage return.
    expect(ics.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes the start and end as UTC instants", () => {
    const ics = buildSessionIcs(session, options);

    expect(property(ics, "DTSTART")).toBe("DTSTART:20261001T193000Z");
    expect(property(ics, "DTEND")).toBe("DTEND:20261001T210000Z");
  });

  it("stamps the file with the time it was produced, not the session's", () => {
    expect(property(buildSessionIcs(session, options), "DTSTAMP")).toBe(
      "DTSTAMP:20260930T120000Z",
    );
  });

  it("gives the same session the same UID every time, so re-downloading updates the event", () => {
    const first = property(buildSessionIcs(session, options), "UID");
    const later = property(
      buildSessionIcs(make({ topic: "Edited topic" }), { ...options, now: new Date() }),
      "UID",
    );

    expect(first).toContain(session.id);
    expect(later).toBe(first);
  });

  it("gives different sessions different UIDs", () => {
    const other = make({ id: "22222222-2222-4222-8222-222222222222" });

    expect(property(buildSessionIcs(other, options), "UID")).not.toBe(
      property(buildSessionIcs(session, options), "UID"),
    );
  });

  it("titles the event with the course code and the topic", () => {
    expect(property(buildSessionIcs(session, options), "SUMMARY")).toBe(
      "SUMMARY:CS 3251 · Dynamic programming",
    );
  });

  it("puts the room in the location when there is one", () => {
    expect(property(buildSessionIcs(session, options), "LOCATION")).toBe(
      "LOCATION:Central Library\\, 418",
    );
  });

  it("omits the room when the host left it blank", () => {
    expect(property(buildSessionIcs(make({ room: null }), options), "LOCATION")).toBe(
      "LOCATION:Central Library",
    );
  });

  it("links back to the session", () => {
    expect(property(buildSessionIcs(session, options), "URL")).toBe(`URL:${options.sessionUrl}`);
  });

  it("names the host in the description", () => {
    expect(property(buildSessionIcs(session, options), "DESCRIPTION")).toContain(
      "Hosted by Priya.",
    );
  });

  it("says nothing about a host whose account is gone", () => {
    const ics = buildSessionIcs(make({ hostDisplayName: null }), options);

    expect(property(ics, "DESCRIPTION")).not.toContain("Hosted by");
    expect(property(ics, "DESCRIPTION")).toContain("Details:");
  });

  it("escapes a topic that would otherwise break the file", () => {
    // A bare comma starts a second value in a TEXT property, and a bare
    // newline ends the property -- either one silently truncates the event.
    const ics = buildSessionIcs(make({ topic: "Graphs, trees; and\nheaps" }), options);

    expect(property(ics, "SUMMARY")).toBe("SUMMARY:CS 3251 · Graphs\\, trees\\; and\\nheaps");
  });

  it("keeps every line inside 75 octets even with a long topic", () => {
    const ics = buildSessionIcs(
      make({ topic: "Revision for the final, covering every unit we have studied this term" }),
      options,
    );

    for (const line of ics.split("\r\n").filter(Boolean)) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("survives a round trip through unfolding with its values intact", () => {
    const ics = buildSessionIcs(
      make({ locationLabel: "Café Carmichael — the long room upstairs, by the window" }),
      options,
    );

    expect(property(ics, "LOCATION")).toBe(
      "LOCATION:Café Carmichael — the long room upstairs\\, by the window\\, 418",
    );
  });
});

describe("icsFileName", () => {
  it("names the file after the course and topic", () => {
    expect(icsFileName(session)).toBe("cs-3251-dynamic-programming.ics");
  });

  it("uses only characters that are safe in a Content-Disposition header", () => {
    const name = icsFileName(make({ topic: 'Quotes " and; commas, and é' }));

    expect(name).toMatch(/^[a-z0-9-]+\.ics$/);
  });

  it("does not end in a hyphen when a long topic is cut short", () => {
    const name = icsFileName(make({ topic: `${"a".repeat(55)} tail` }));

    expect(name).not.toContain("-.ics");
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it("still returns a usable name when there is nothing to slugify", () => {
    const name = icsFileName(
      make({ course: { departmentCode: "", number: "", title: null }, topic: "—" }),
    );

    expect(name).toBe("session.ics");
  });
});
