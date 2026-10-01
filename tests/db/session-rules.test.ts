import type { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * S1 -- create_session() and the rules beside it
 * (supabase/migrations/20261001031738_s1_session_rules.sql).
 *
 * Passing (3/3 clean runs) against a hand-built plain-Postgres stand-in for
 * Supabase -- no Docker in the environment that wrote this, so not the real
 * local stack. Run `npm run db:start && npm run test:db` for real before
 * trusting this further -- see HANDOFF.md.
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
    // Not relying on the seed: this suite must also pass against a database
    // that has only had migrations applied.
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

function validSessionArgs(overrides: Record<string, unknown> = {}) {
  return {
    course_id: courseId,
    location_id: locationId,
    location_label: "Featheringill Hall",
    room: "134",
    topic: "Sprint 2 review",
    starts_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    ends_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    capacity: 4,
    ...overrides,
  };
}

async function callCreateSession(db: Client, args: Record<string, unknown>) {
  return db.query(
    `select * from public.create_session(
       $1::uuid, $2::uuid, $3::text, $4::text, $5::text,
       $6::timestamptz, $7::timestamptz, $8::integer
     )`,
    [
      args.course_id,
      args.location_id,
      args.location_label,
      args.room,
      args.topic,
      args.starts_at,
      args.ends_at,
      args.capacity,
    ],
  );
}

describe("create_session (S1, US-02)", () => {
  it("rejects when no one is signed in", async () => {
    const db = await connection();
    await expect(callCreateSession(db, validSessionArgs())).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a caller with no display name (ADR 0008 rule 1)", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: null });
    await signInAs(db, userId);
    await expect(callCreateSession(db, validSessionArgs())).rejects.toThrow(
      /display_name_required/,
    );
  });

  it("rejects a start more than the 5-minute grace period in the past", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    await expect(
      callCreateSession(db, validSessionArgs({ starts_at: sixMinutesAgo })),
    ).rejects.toThrow(/starts_in_past/);
  });

  it("allows a start within the grace period (mirrors START_GRACE_MINUTES)", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const result = await callCreateSession(db, validSessionArgs({ starts_at: threeMinutesAgo }));
    expect(result.rows).toHaveLength(1);
  });

  it("rejects an end at or before the start -- the CHECK, not the function", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    const now = new Date().toISOString();
    await expect(
      callCreateSession(db, validSessionArgs({ starts_at: now, ends_at: now })),
    ).rejects.toThrow(/sessions_ends_after_starts/);
  });

  it("rejects a capacity under 2 -- the CHECK, not the function", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    await expect(callCreateSession(db, validSessionArgs({ capacity: 1 }))).rejects.toThrow(
      /sessions_capacity_min/,
    );
  });

  it("has no product maximum on capacity", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    const result = await callCreateSession(db, validSessionArgs({ capacity: 500 }));
    expect(result.rows[0].capacity).toBe(500);
  });

  it("inserts the session and seats the host as the first attendee, atomically", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);

    const result = await callCreateSession(db, validSessionArgs());
    expect(result.rows).toHaveLength(1);
    const session = result.rows[0];
    expect(session.host_id).toBe(userId);
    expect(session.capacity).toBe(4);

    const attendees = await db.query(
      `select user_id from public.session_attendees where session_id = $1`,
      [session.id],
    );
    expect(attendees.rows).toEqual([{ user_id: userId }]);
  });

  it("ignores a host_id-shaped field from the caller -- the host is always auth.uid()", async () => {
    // create_session takes no host parameter at all, so there is nothing to
    // pass; this documents that invariant rather than testing a code path.
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);
    const result = await callCreateSession(db, validSessionArgs());
    expect(result.rows[0].host_id).toBe(userId);
  });
});

describe("RLS on sessions and session_attendees (S1)", () => {
  it("lets any signed-in user read a session and its roster, not only the host", async () => {
    const owner = await connection();
    const ownerId = await createUser(owner, { displayName: "Jamie Host" });
    await signInAs(owner, ownerId);
    const created = await callCreateSession(owner, validSessionArgs());
    const sessionId = created.rows[0].id;

    const reader = await connection();
    const readerId = await createUser(reader, { displayName: "Alex Reader" });
    await signInAs(reader, readerId);

    const sessions = await reader.query("select id from public.sessions where id = $1", [
      sessionId,
    ]);
    expect(sessions.rows).toHaveLength(1);

    const attendees = await reader.query(
      "select user_id from public.session_attendees where session_id = $1",
      [sessionId],
    );
    expect(attendees.rows).toEqual([{ user_id: ownerId }]);
  });

  it("hides sessions from a connection with no signed-in user", async () => {
    const owner = await connection();
    const ownerId = await createUser(owner, { displayName: "Jamie Host" });
    await signInAs(owner, ownerId);
    const created = await callCreateSession(owner, validSessionArgs());
    const sessionId = created.rows[0].id;

    const anon = await connection();
    await anon.query("set role anon");
    const sessions = await anon.query("select id from public.sessions where id = $1", [
      sessionId,
    ]);
    expect(sessions.rows).toEqual([]);
  });

  it("refuses a direct client INSERT into session_attendees -- only create_session may write it", async () => {
    const owner = await connection();
    const ownerId = await createUser(owner, { displayName: "Jamie Host" });
    await signInAs(owner, ownerId);
    const created = await callCreateSession(owner, validSessionArgs());
    const sessionId = created.rows[0].id;

    const intruder = await connection();
    const intruderId = await createUser(intruder, { displayName: "Sam Intruder" });
    await signInAs(intruder, intruderId);

    await expect(
      intruder.query(
        "insert into public.session_attendees (session_id, user_id) values ($1, $2)",
        [sessionId, intruderId],
      ),
    ).rejects.toThrow();
  });

  it("refuses a direct client INSERT into sessions -- only create_session may write it", async () => {
    const db = await connection();
    const userId = await createUser(db, { displayName: "Jamie Host" });
    await signInAs(db, userId);

    const args = validSessionArgs();
    await expect(
      db.query(
        `insert into public.sessions
           (host_id, course_id, location_id, location_label, room, topic, starts_at, ends_at, capacity)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          args.course_id,
          args.location_id,
          args.location_label,
          args.room,
          args.topic,
          args.starts_at,
          args.ends_at,
          args.capacity,
        ],
      ),
    ).rejects.toThrow();
  });
});
