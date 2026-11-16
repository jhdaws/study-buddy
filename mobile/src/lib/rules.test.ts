import { describe, expect, it } from "vitest";

import {
  checkCode,
  checkEmail,
  GENERIC_ERROR,
  passwordErrorMessage,
  sendCodeErrorMessage,
  verifyCodeErrorMessage,
} from "./auth-rules";
import {
  formatCampusDay,
  formatTime,
  formatWhen,
  groupByDay,
  isInProgress,
  seatsLeft,
  seatsText,
  toSessionItems,
  type SessionItem,
  type SessionRow,
} from "./sessions";

describe("checkEmail", () => {
  it("accepts a Vanderbilt address, trimmed and lowercased", () => {
    expect(checkEmail("  Jane.Doe@Vanderbilt.EDU ")).toEqual({ ok: true, value: "jane.doe@vanderbilt.edu" });
  });

  it.each([
    ["", "Enter your Vanderbilt email address."],
    ["not an email", "Enter a valid email address."],
    ["jane@gmail.com", "Use your @vanderbilt.edu email address."],
    ["jane@mail.vanderbilt.edu", "Use your @vanderbilt.edu email address."],
    ["jane@vanderbilt.edu.evil.com", "Use your @vanderbilt.edu email address."],
  ])("refuses %j", (input, message) => {
    expect(checkEmail(input)).toEqual({ ok: false, message });
  });
});

describe("checkCode", () => {
  it("accepts 6 to 10 digits, dropping spaces and hyphens", () => {
    expect(checkCode("123 456")).toEqual({ ok: true, value: "123456" });
    expect(checkCode("12-34-56-78-90")).toEqual({ ok: true, value: "1234567890" });
  });

  it.each(["12345", "12345678901", "12a456", ""])("refuses %j", (input) => {
    expect(checkCode(input).ok).toBe(false);
  });
});

describe("error messages", () => {
  it("never says whether an account exists on a wrong password", () => {
    const message = passwordErrorMessage({ code: "invalid_credentials", status: 400 });
    expect(message).toMatch(/don't match/);
    expect(message).not.toMatch(/no account|not found|exist/i);
  });

  it("maps rate limits, expired codes and new students", () => {
    expect(passwordErrorMessage({ status: 429 })).toMatch(/Too many/);
    expect(sendCodeErrorMessage({ code: "over_email_send_rate_limit", status: 429 })).toMatch(/Too many/);
    expect(sendCodeErrorMessage({ code: "otp_disabled", status: 422 })).toMatch(/Sign up on the website/);
    expect(verifyCodeErrorMessage({ code: "otp_expired", status: 403 })).toMatch(/wrong or has expired/);
    expect(verifyCodeErrorMessage({ status: 429 })).toMatch(/Too many/);
  });

  it("falls back to a generic message, never Supabase's own text", () => {
    for (const fn of [passwordErrorMessage, sendCodeErrorMessage, verifyCodeErrorMessage]) {
      expect(fn({ status: 500 })).toBe(GENERIC_ERROR);
      expect(fn(undefined)).toBe(GENERIC_ERROR);
    }
  });
});

const row = (overrides: Partial<SessionRow> = {}): SessionRow => ({
  id: "s1",
  topic: "Midterm review",
  location_label: "Central Library",
  room: "Room 204",
  starts_at: "2026-11-17T01:00:00.000Z",
  ends_at: "2026-11-17T03:00:00.000Z",
  capacity: 4,
  host_id: "h1",
  status: "open",
  courses: { department_code: "CS", number: "3251", title: "Intermediate Software Design" },
  profiles: { display_name: "Priya" },
  session_attendees: [{ count: 3 }],
  ...overrides,
});

describe("toSessionItems", () => {
  it("shapes a row for the list", () => {
    const [item] = toSessionItems([row()], new Set());
    expect(item).toMatchObject({
      course: "CS 3251",
      place: "Central Library, Room 204",
      host: "Priya",
      going: 3,
      seatsLeft: 1,
    });
  });

  it("sorts soonest first even when rows arrive out of order", () => {
    const items = toSessionItems(
      [row({ id: "later", starts_at: "2026-11-18T01:00:00.000Z" }), row({ id: "sooner" })],
      new Set(),
    );
    expect(items.map((item) => item.id)).toEqual(["sooner", "later"]);
  });

  it("leaves out blocked hosts and rows it cannot show, and keeps a deleted host", () => {
    const items = toSessionItems(
      [
        row({ id: "blocked", host_id: "bad" }),
        row({ id: "no-course", courses: null }),
        row({ id: "bad-date", starts_at: "not a date" }),
        row({ id: "deleted-host", host_id: null, profiles: null, room: null, session_attendees: null }),
      ],
      new Set(["bad"]),
    );
    expect(items.map((item) => item.id)).toEqual(["deleted-host"]);
    expect(items[0]).toMatchObject({ host: "Deleted user", place: "Central Library", going: 0, seatsLeft: 4 });
  });
});

describe("seats and time", () => {
  it("never shows negative seats, and says Full at zero", () => {
    expect(seatsLeft(5, 4)).toBe(0);
    expect(seatsText({ seatsLeft: 0 })).toBe("Full");
    expect(seatsText({ seatsLeft: 1 })).toBe("1 seat left");
    expect(seatsText({ seatsLeft: 3 })).toBe("3 seats left");
  });

  it("formats in campus time, not the phone's zone", () => {
    // 01:00Z on Nov 17 is 7:00 PM on Nov 16 in Nashville (CST, UTC-6).
    expect(formatWhen(new Date("2026-11-17T01:00:00Z"), new Date("2026-11-17T03:00:00Z"))).toBe(
      "Mon, Nov 16 · 7:00 PM – 9:00 PM",
    );
  });
});

describe("day headings and times (as on the web list)", () => {
  // 18:00Z on Mon Nov 16 is noon on Nov 16 in Nashville.
  const now = new Date("2026-11-16T18:00:00Z");
  const item = (id: string, start: string, end: string): SessionItem => ({
    id,
    course: "CS 3251",
    courseTitle: null,
    topic: "t",
    place: "p",
    host: "h",
    startsAt: new Date(start),
    endsAt: new Date(end),
    going: 1,
    capacity: 4,
    seatsLeft: 3,
  });

  it("names the campus day, not the UTC day", () => {
    // 03:00Z on Nov 17 is still 9 PM on Nov 16 in Nashville.
    expect(formatCampusDay(new Date("2026-11-17T03:00:00Z"), now)).toBe("Today");
    expect(formatCampusDay(new Date("2026-11-17T18:00:00Z"), now)).toBe("Tomorrow");
    expect(formatCampusDay(new Date("2026-11-19T18:00:00Z"), now)).toBe("Thu, Nov 19");
    expect(formatTime(new Date("2026-11-17T01:00:00Z"))).toBe("7:00 PM");
  });

  it("groups soonest first, and counts a session still running from yesterday as Today", () => {
    const groups = groupByDay(
      [
        item("late", "2026-11-16T04:00:00Z", "2026-11-16T19:00:00Z"), // Nov 15, 10 PM, still on
        item("a", "2026-11-16T20:00:00Z", "2026-11-16T22:00:00Z"),
        item("b", "2026-11-17T20:00:00Z", "2026-11-17T22:00:00Z"),
        item("c", "2026-11-19T20:00:00Z", "2026-11-19T22:00:00Z"),
      ],
      now,
    );
    expect(groups.map((g) => [g.title, g.data.map((i) => i.id)])).toEqual([
      ["Today", ["late", "a"]],
      ["Tomorrow", ["b"]],
      ["Thu, Nov 19", ["c"]],
    ]);
  });

  it("knows when a session is happening now", () => {
    const live = item("x", "2026-11-16T17:00:00Z", "2026-11-16T19:00:00Z");
    expect(isInProgress(live, now)).toBe(true);
    expect(isInProgress(live, new Date("2026-11-16T19:00:00Z"))).toBe(false);
  });
});
