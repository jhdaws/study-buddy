import type { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * S5 -- join_session(), leave_session(), and the RLS beside them
 * (supabase/migrations/20261018184357_join_leave_session.sql).
 *
 * Not run against a real database -- no Docker in the environment that
 * wrote this. Run `npm run db:start && npm run test:db` for real before
 * trusting this further -- see HANDOFF.md. Written against the same local
 * harness session-rules.test.ts documents (tests/db/connection.ts,
 * auth-fixtures.ts), so the same caveat about auth.users' real shape applies.
 */

const open: Client[] = [];

async function connection(): Promise<Client> {
  const client = await connect();
  open.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((client) => client.end()));
});

let courseId: string;
let locationId: string;

beforeAll(async () => {
  const db = await connect();
  try {
    await db.query(`
      insert into public.departments (code) values ('CS')
      on conflict (code) do nothing
    `);

    const course = await db.query<{ id: string }>(`
      insert into public.courses (department_code, number, title)
      values ('CS', '4278', 'Principles of Software Engineering')
      on conflict (department_code, number) do update set title = excluded.title
      returning id
    `);
    courseId = course.rows[0].id;

    const location = await db.query<{ id: string }>(`
      insert into public.locations (place_id, lat, lng)
      values ('ChIJ-test-featheringill-hall', 36.1447, -86.8027)
      on conflict (place_id) do update set lat = excluded.lat
      returning id
    `);
    locationId = location.rows[0].id;
  } finally {
    await db.end();
  }
});

/**
 * Runs `fn` as the database's own role (bypassing RLS), then restores
 * `authenticated` -- for test setup `create_session`/`join_session`/
 * `leave_session` refuse on purpose, the same way session-rules.test.ts
 * borrows the server's role for its course and location rows.
 */
async function asServer<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  try {
    return await fn();
  } finally {
    await db.query("set role authenticated");
  }
}

/** A session hosted by `hostId` (signed in on `db`), already seated as its first attendee. */
async function hostSession(
  db: Client,
  hostId: string,
  options: {
    capacity?: number;
    startsInMinutes?: number;
    endsInMinutes?: number;
    status?: "open" | "cancelled";
  } = {},
): Promise<string> {
  const startsAt = new Date(Date.now() + (options.startsInMinutes ?? 60) * 60 * 1000);
  const endsAt = new Date(Date.now() + (options.endsInMinutes ?? 120) * 60 * 1000);
  const capacity = options.capacity ?? 4;

  let sessionId: string;
  if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
    // create_session refuses a start more than the 5-minute grace period in
    // the past (starts_in_past, S1) -- by design, the same grace it allows.
    // An "already ended" session has to be set up directly instead, as
    // session-rules.test.ts does for its course and location rows.
    sessionId = await asServer(db, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.sessions
           (host_id, course_id, location_id, location_label, room, topic, starts_at, ends_at, capacity)
         values ($1, $2, $3, 'Featheringill Hall', '134', 'Sprint 3 join/leave', $4, $5, $6)
         returning id`,
        [hostId, courseId, locationId, startsAt.toISOString(), endsAt.toISOString(), capacity],
      );
      const id = inserted.rows[0].id;
      await db.query(
        `insert into public.session_attendees (session_id, user_id) values ($1, $2)`,
        [id, hostId],
      );
      return id;
    });
  } else {
    const { rows } = await db.query<{ id: string }>(
      `select (public.create_session(
         $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
         $6::timestamptz, $7::timestamptz, $8::integer
       )).id`,
      [
        courseId,
        locationId,
        "Featheringill Hall",
        "134",
        "Sprint 3 join/leave",
        startsAt.toISOString(),
        endsAt.toISOString(),
        capacity,
      ],
    );
    sessionId = rows[0].id;
  }

  if (options.status === "cancelled") {
    // No cancel function yet (US-09, later), and no UPDATE policy on
    // sessions either -- without the server's role this would silently
    // affect 0 rows (RLS's implicit USING(false), same as the DELETE test
    // below), not actually cancel anything.
    await asServer(db, () =>
      db.query(`update public.sessions set status = 'cancelled' where id = $1`, [sessionId]),
    );
  }

  return sessionId;
}

async function joinSession(db: Client, sessionId: string) {
  return db.query("select * from public.join_session($1)", [sessionId]);
}

async function leaveSession(db: Client, sessionId: string) {
  return db.query("select public.leave_session($1)", [sessionId]);
}

async function rosterCount(db: Client, sessionId: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    "select count(*) from public.session_attendees where session_id = $1",
    [sessionId],
  );
  return Number(rows[0].count);
}

describe("join_session (S5, US-04, US-07)", () => {
  it("rejects when no one is signed in", async () => {
    const db = await connection();
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    await expect(joinSession(db, sessionId)).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a caller with no display name (ADR 0008 rule 1)", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    const userId = await createUser(db, { displayName: null });
    await signInAs(db, userId);
    await expect(joinSession(db, sessionId)).rejects.toThrow(/display_name_required/);
  });

  it("rejects a made-up session id", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(joinSession(db, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      /session_not_found/,
    );
  });

  it("rejects joining a cancelled session", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId, { status: "cancelled" });

    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(joinSession(db, sessionId)).rejects.toThrow(/session_cancelled/);
  });

  it("rejects joining a session that has already ended", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId, { startsInMinutes: -120, endsInMinutes: -60 });

    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(joinSession(db, sessionId)).rejects.toThrow(/session_ended/);
  });

  it("rejects joining a session the caller is already on the roster for", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    // The host is already seated by create_session.
    await expect(joinSession(host, sessionId)).rejects.toThrow(/already_joined/);
  });

  it("rejects joining a full session", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId, { capacity: 2 });

    const filler = await connection();
    const fillerId = await createUser(filler, { displayName: "Taylor Filler" });
    await signInAs(filler, fillerId);
    await joinSession(filler, sessionId);

    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(joinSession(db, sessionId)).rejects.toThrow(/session_full/);
  });

  it("seats the caller on the roster", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    const result = await joinSession(db, sessionId);
    expect(result.rows).toEqual([
      expect.objectContaining({ session_id: sessionId, user_id: userId }),
    ]);
    expect(await rosterCount(db, sessionId)).toBe(2);
  });

  it("US-07b: two students racing for the last seat -- exactly one succeeds", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    // Capacity 2: the host already fills one seat, leaving exactly one.
    const sessionId = await hostSession(host, hostId, { capacity: 2 });

    const a = await connection();
    const aliceId = await createUser(a, { displayName: "Alice Racer" });
    await signInAs(a, aliceId);

    const b = await connection();
    const bobId = await createUser(b, { displayName: "Bob Racer" });
    await signInAs(b, bobId);

    const results = await Promise.allSettled([joinSession(a, sessionId), joinSession(b, sessionId)]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/session_full/);

    // The roster never exceeded capacity, whoever won.
    expect(await rosterCount(host, sessionId)).toBe(2);
  });
});

describe("leave_session (S5, US-08)", () => {
  it("rejects when no one is signed in", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    await expect(leaveSession(db, sessionId)).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a made-up session id", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(leaveSession(db, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(
      /session_not_found/,
    );
  });

  it("refuses the host -- they cancel instead (ADR 0008 rule 3, US-09)", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    await expect(leaveSession(host, sessionId)).rejects.toThrow(/host_cannot_leave/);
    expect(await rosterCount(host, sessionId)).toBe(1);
  });

  it("rejects a caller who is not on the roster", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    const userId = await createUser(db, { displayName: "Alex Student" });
    await signInAs(db, userId);
    await expect(leaveSession(db, sessionId)).rejects.toThrow(/not_joined/);
  });

  it("removes the caller and frees the seat for someone else", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId, { capacity: 2 });

    const alex = await connection();
    const alexId = await createUser(alex, { displayName: "Alex Student" });
    await signInAs(alex, alexId);
    await joinSession(alex, sessionId);
    expect(await rosterCount(host, sessionId)).toBe(2);

    await leaveSession(alex, sessionId);
    expect(await rosterCount(host, sessionId)).toBe(1);

    // The seat is free again for someone else.
    const sam = await connection();
    const samId = await createUser(sam, { displayName: "Sam Student" });
    await signInAs(sam, samId);
    await joinSession(sam, sessionId);
    expect(await rosterCount(host, sessionId)).toBe(2);
  });
});

describe("grants on join_session and leave_session (S5)", () => {
  it("refuses anon EXECUTE on join_session", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const anon = await connection();
    await anon.query("set role anon");
    await expect(joinSession(anon, sessionId)).rejects.toThrow(/permission denied/);
  });

  it("refuses anon EXECUTE on leave_session", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const anon = await connection();
    await anon.query("set role anon");
    await expect(leaveSession(anon, sessionId)).rejects.toThrow(/permission denied/);
  });

  it("refuses a direct client DELETE on session_attendees -- only leave_session may write it", async () => {
    const host = await connection();
    const hostId = await createUser(host, { displayName: "Jamie Host" });
    await signInAs(host, hostId);
    const sessionId = await hostSession(host, hostId);

    const other = await connection();
    const otherId = await createUser(other, { displayName: "Alex Student" });
    await signInAs(other, otherId);
    await joinSession(other, sessionId);

    // No DELETE policy exists, so RLS's implicit USING(false) filters the
    // target row out before the DELETE runs -- it reports 0 rows affected
    // rather than an error (unlike the INSERT case in session-rules.test.ts,
    // where a failing WITH CHECK always raises).
    const result = await other.query(
      "delete from public.session_attendees where session_id = $1 and user_id = $2",
      [sessionId, otherId],
    );
    expect(result.rowCount).toBe(0);
    expect(await rosterCount(host, sessionId)).toBe(2);
  });
});
