// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHAT_HISTORY_LIMIT } from "@/lib/limits";

import { listMessages } from "./messages";

// listMessages() (US-05) with the database replaced. Who may read which rows
// is RLS's job, tested against real Postgres in tests/db/session-chat.test.ts;
// these check the query asked for and the shape handed to the page.

type Recorded = { method: string; args: unknown[] }[];

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: db.from }),
}));

let calls: Recorded;

function respond(data: unknown, error: { message: string } | null = null) {
  calls = [];
  db.from.mockImplementation((table: string) => {
    calls.push({ method: "from", args: [table] });
    const builder: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
    };
    for (const method of ["select", "eq", "order", "limit"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ method, args });
        return builder;
      };
    }
    return builder;
  });
}

const SESSION = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listMessages", () => {
  it("asks for this session's latest messages, newest first, with a stable tiebreak", async () => {
    respond([]);

    await listMessages(SESSION);

    expect(calls).toEqual([
      { method: "from", args: ["session_messages"] },
      { method: "select", args: ["id, author_id, body, created_at, profiles (display_name)"] },
      { method: "eq", args: ["session_id", SESSION] },
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
      { method: "limit", args: [CHAT_HISTORY_LIMIT] },
    ]);
  });

  it("returns them oldest first, with each sender's name, and none for a deleted account", async () => {
    respond([
      {
        id: "m2",
        author_id: null,
        body: "See you there",
        created_at: "2026-11-11T18:05:00Z",
        profiles: null,
      },
      {
        id: "m1",
        author_id: "host",
        body: "Table by the window",
        created_at: "2026-11-11T18:00:00Z",
        profiles: { display_name: "Priya" },
      },
    ]);

    expect(await listMessages(SESSION)).toEqual([
      {
        id: "m1",
        authorId: "host",
        authorDisplayName: "Priya",
        body: "Table by the window",
        createdAt: "2026-11-11T18:00:00Z",
      },
      {
        id: "m2",
        authorId: null,
        authorDisplayName: null,
        body: "See you there",
        createdAt: "2026-11-11T18:05:00Z",
      },
    ]);
  });

  it("throws on a database error, for the page's error boundary", async () => {
    respond(null, { message: "connection refused" });

    await expect(listMessages(SESSION)).rejects.toThrow("Could not load the chat");
  });
});
