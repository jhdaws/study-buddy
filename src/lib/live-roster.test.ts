import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { REFRESH_DELAY_MS, subscribeToChat, subscribeToRoster } from "./live-roster";

// A stand-in for supabase-js's channel API: records each .on() filter and
// callback, and lets a test play Realtime's part by firing them. What the
// real server sends is checked against a live local stack, not here.

type Filter = { event: string; schema: string; table: string; filter?: string };
type Handler = (payload: { old: Record<string, unknown> }) => void;

function fakeClient(setAuth: () => Promise<void> = async () => undefined) {
  const listeners: { filter: Filter; handler: Handler }[] = [];
  let onStatus: ((status: string) => void) | undefined;

  const channel = {
    on: vi.fn((_type: string, filter: Filter, handler: Handler) => {
      listeners.push({ filter, handler });
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      onStatus = callback;
      return channel;
    }),
  };

  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok" as const),
    realtime: { setAuth: vi.fn(setAuth) },
  };

  const fire = (event: string, old: Record<string, unknown> = {}) => {
    for (const { filter, handler } of listeners) {
      if (filter.event === event) handler({ old });
    }
  };

  return {
    // The real type is SupabaseClient; only these three members are used.
    client: client as unknown as Parameters<typeof subscribeToRoster>[0],
    raw: client,
    channel,
    listeners,
    fire,
    status: (status: string) => onStatus?.(status),
  };
}

/** Let realtime.setAuth() resolve, so the channel is subscribed. */
const authSettles = () => vi.advanceTimersByTimeAsync(0);

const SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("subscribeToRoster", () => {
  it("listens to joins for this session only, and to every leave", async () => {
    const fake = fakeClient();
    subscribeToRoster(fake.client, SESSION, vi.fn());
    await authSettles();

    // A topic of its own each time, so a remount never gets the old channel back.
    expect(fake.raw.channel).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^roster:${SESSION}:[0-9a-f-]{36}$`)),
    );
    expect(fake.listeners.map((l) => l.filter)).toEqual([
      {
        event: "INSERT",
        schema: "public",
        table: "session_attendees",
        filter: `session_id=eq.${SESSION}`,
      },
      // No filter: Realtime cannot filter DELETE events.
      { event: "DELETE", schema: "public", table: "session_attendees" },
    ]);
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it("reports a join after the delay", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("INSERT");
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports a leave from this session", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("DELETE", { session_id: SESSION, user_id: "someone" });
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores a leave from another session", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("DELETE", { session_id: OTHER, user_id: "someone" });
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("treats a leave with no session_id as possibly this session's", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("DELETE", {});
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("reports once on every SUBSCRIBED, to catch up on anything missed", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.status("SUBSCRIBED");
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    // A reconnect after the connection dropped.
    fake.status("CHANNEL_ERROR");
    fake.status("SUBSCRIBED");
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("does not report other channel states", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    for (const status of ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]) fake.status(status);
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("coalesces a burst of changes into one report", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("INSERT");
    fake.fire("DELETE", { session_id: SESSION });
    fake.fire("INSERT");
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    // A change after the burst is reported on its own.
    fake.fire("INSERT");
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stops: removes the channel and drops a pending report", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    const stop = subscribeToRoster(fake.client, SESSION, onChange);
    await authSettles();

    fake.fire("INSERT");
    stop();
    vi.advanceTimersByTime(REFRESH_DELAY_MS);
    fake.fire("INSERT");
    vi.advanceTimersByTime(REFRESH_DELAY_MS);

    expect(onChange).not.toHaveBeenCalled();
    expect(fake.raw.removeChannel).toHaveBeenCalledWith(fake.channel);
  });

  it("waits for the student's token before joining the channel", async () => {
    let grantToken!: () => void;
    const fake = fakeClient(() => new Promise<void>((resolve) => (grantToken = resolve)));
    subscribeToRoster(fake.client, SESSION, vi.fn());

    expect(fake.raw.realtime.setAuth).toHaveBeenCalledWith();
    await authSettles();
    expect(fake.raw.channel).not.toHaveBeenCalled();

    grantToken();
    await authSettles();
    expect(fake.raw.channel).toHaveBeenCalledTimes(1);
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);
  });

  it("never joins if stopped before the token arrives", async () => {
    let grantToken!: () => void;
    const fake = fakeClient(() => new Promise<void>((resolve) => (grantToken = resolve)));
    const stop = subscribeToRoster(fake.client, SESSION, vi.fn());

    stop();
    grantToken();
    await authSettles();

    expect(fake.raw.channel).not.toHaveBeenCalled();
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();
  });

  it("still subscribes if looking up the token fails, and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = fakeClient(async () => {
      throw new Error("no session");
    });
    subscribeToRoster(fake.client, SESSION, vi.fn());
    await authSettles();

    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);
    // The error's name only, never the error object (it could carry the token).
    expect(warn).toHaveBeenCalledWith("realtime: could not set the token", {
      error: "Error",
    });
    warn.mockRestore();
  });

  it("gives each subscription its own topic, even for the same session", async () => {
    const fake = fakeClient();
    subscribeToRoster(fake.client, SESSION, vi.fn());
    subscribeToRoster(fake.client, SESSION, vi.fn());
    await authSettles();

    const [first, second] = (fake.raw.channel.mock.calls as unknown as [string][]).map(
      ([topic]) => topic,
    );
    expect(first).not.toBe(second);
  });
});

// The chat (US-05) shares listen() with the roster, so the coalescing, the
// catch-up on SUBSCRIBED and the setAuth() wait tested above are the same
// code. These check what is chat-specific: the channel and the one filter.
describe("subscribeToChat", () => {
  it("listens on its own channel to new messages in this session only", async () => {
    const fake = fakeClient();
    subscribeToChat(fake.client, SESSION, vi.fn());
    await authSettles();

    expect(fake.raw.channel).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^chat:${SESSION}:[0-9a-f-]{36}$`)),
    );
    // Only INSERTs: nobody can edit or delete a message.
    expect(fake.listeners.map((l) => l.filter)).toEqual([
      {
        event: "INSERT",
        schema: "public",
        table: "session_messages",
        filter: `session_id=eq.${SESSION}`,
      },
    ]);
  });

  it("reports a new message, and every (re)subscribe, once per burst", async () => {
    const fake = fakeClient();
    const onChange = vi.fn();
    subscribeToChat(fake.client, SESSION, onChange);
    await authSettles();

    fake.status("SUBSCRIBED");
    fake.fire("INSERT");
    fake.fire("INSERT");
    await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(1);

    fake.fire("INSERT");
    await vi.advanceTimersByTimeAsync(REFRESH_DELAY_MS);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("waits for the token, and stops cleanly", async () => {
    let grantToken!: () => void;
    const fake = fakeClient(() => new Promise<void>((resolve) => (grantToken = resolve)));
    const stop = subscribeToChat(fake.client, SESSION, vi.fn());

    await authSettles();
    expect(fake.raw.channel).not.toHaveBeenCalled();

    grantToken();
    await authSettles();
    stop();
    expect(fake.raw.removeChannel).toHaveBeenCalledWith(fake.channel);
  });
});
