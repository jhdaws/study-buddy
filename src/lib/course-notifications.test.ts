// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  countNewSessionsInMyCourses,
  listNewSessionsInMyCourses,
  markSessionsSeen,
} from "./course-notifications";

// The three RPCs (N1/US-17) with the database replaced. The policies and
// functions themselves are tested against real Postgres in
// tests/db/new-in-your-courses.test.ts.

const server = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: server.rpc }),
}));

beforeEach(() => {
  server.rpc.mockReset();
});

describe("countNewSessionsInMyCourses", () => {
  it("returns the count the database gives back", async () => {
    server.rpc.mockResolvedValue({ data: 3, error: null });

    expect(await countNewSessionsInMyCourses()).toBe(3);
    expect(server.rpc).toHaveBeenCalledWith("count_new_sessions_in_my_courses");
  });

  it("throws rather than hiding a database error behind a count", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(countNewSessionsInMyCourses()).rejects.toThrow(/could not count/i);
  });

  it("treats a null count as zero", async () => {
    server.rpc.mockResolvedValue({ data: null, error: null });

    expect(await countNewSessionsInMyCourses()).toBe(0);
  });
});

describe("listNewSessionsInMyCourses", () => {
  it("maps each row from the database's snake_case shape", async () => {
    server.rpc.mockResolvedValue({
      data: [
        {
          id: "s1",
          topic: "Midterm review",
          department_code: "CS",
          course_number: "3251",
          course_title: "Intermediate Software Design",
          starts_at: "2026-11-12T18:00:00.000Z",
          ends_at: "2026-11-12T19:00:00.000Z",
          location_label: "Central Library",
        },
      ],
      error: null,
    });

    expect(await listNewSessionsInMyCourses()).toEqual([
      {
        id: "s1",
        topic: "Midterm review",
        course: { departmentCode: "CS", number: "3251", title: "Intermediate Software Design" },
        startsAt: "2026-11-12T18:00:00.000Z",
        endsAt: "2026-11-12T19:00:00.000Z",
        locationLabel: "Central Library",
      },
    ]);
    expect(server.rpc).toHaveBeenCalledWith("new_sessions_in_my_courses");
  });

  it("returns an empty list rather than null", async () => {
    server.rpc.mockResolvedValue({ data: null, error: null });

    expect(await listNewSessionsInMyCourses()).toEqual([]);
  });

  it("throws on a database error", async () => {
    server.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listNewSessionsInMyCourses()).rejects.toThrow(/could not load/i);
  });
});

describe("markSessionsSeen", () => {
  it("calls the RPC and resolves with nothing", async () => {
    server.rpc.mockResolvedValue({ error: null });

    await expect(markSessionsSeen()).resolves.toBeUndefined();
    expect(server.rpc).toHaveBeenCalledWith("mark_sessions_seen");
  });

  it("throws on a database error", async () => {
    server.rpc.mockResolvedValue({ error: { message: "boom" } });

    await expect(markSessionsSeen()).rejects.toThrow(/could not update/i);
  });
});
