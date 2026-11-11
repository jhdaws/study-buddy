import type { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * S10 -- create_sessions_weekly() (US-20)
 * (supabase/migrations/20261111000231_s10_repeat_weekly.sql).
 *
 * The points that can go wrong without a real database:
 *   - N independent rows, host seated on each
 *   - the 2..8 cap (form AND database)
 *   - host from auth.uid(), never a parameter
 *   - "a week later" is Chicago wall-clock time, not +168 hours (DST)
 *   - a refused call leaves no partial series
 *
 * Run: `npm run db:start && npm run test:db`.
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

async function asServer<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  try {
    return await fn();
  } finally {
    await db.query("set role authenticated");
  }
}

async function student(db: Client, displayName = "Weekly Host"): Promise<string> {
  const id = await asServer(db, () => createUser(db, { displayName }));
  await signInAs(db, id);
  return id;
}

/** A start/end a few hours out, lasting two hours. */
function soonWindow(hoursFromNow = 24): { starts: string; ends: string } {
  const starts = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return { starts: starts.toISOString(), ends: ends.toISOString() };
}

async function createWeekly(
  db: Client,
  options: {
    weeks: number;
    starts?: string;
    ends?: string;
    topic?: string;
    capacity?: number;
  },
) {
  const window = soonWindow();
  return db.query<{
    id: string;
    host_id: string;
    starts_at: Date;
    ends_at: Date;
    location_id: string;
    topic: string;
  }>(
    `select * from public.create_sessions_weekly(
       $1, $2, 'Featheringill Hall', '112', $3,
       $4::timestamptz, $5::timestamptz, $6, $7
     )`,
    [
      courseId,
      locationId,
      options.topic ?? `Weekly ${Date.now()}`,
      options.starts ?? window.starts,
      options.ends ?? window.ends,
      options.capacity ?? 4,
      options.weeks,
    ],
  );
}

describe("create_sessions_weekly", () => {
  it("creates N independent sessions a week apart, with the host on each roster", async () => {
    const db = await connection();
    const hostId = await student(db);
    const topic = `Series ${Date.now()}`;

    const { rows } = await createWeekly(db, { weeks: 3, topic });

    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.host_id === hostId)).toBe(true);
    expect(rows.every((row) => row.location_id === locationId)).toBe(true);
    expect(new Set(rows.map((row) => row.id)).size).toBe(3);

    // Each copy is its own row with the host seated -- the same shape
    // create_session leaves, so edit/cancel (US-09) work on any one alone.
    for (const row of rows) {
      const roster = await db.query(
        `select user_id from public.session_attendees where session_id = $1`,
        [row.id],
      );
      expect(roster.rows).toEqual([{ user_id: hostId }]);
    }

    // Spaced by one Chicago week, not just "ordered".
    const starts = rows.map((row) => row.starts_at.getTime()).sort((a, b) => a - b);
    expect(starts[1]! - starts[0]!).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    expect(starts[2]! - starts[1]!).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });

  it("refuses fewer than 2 weeks and leaves no rows behind", async () => {
    const db = await connection();
    await student(db);
    const topic = `Too short ${Date.now()}`;

    await expect(createWeekly(db, { weeks: 1, topic })).rejects.toMatchObject({
      message: expect.stringContaining("weeks_out_of_range"),
    });

    const leftover = await db.query(`select 1 from public.sessions where topic = $1`, [topic]);
    expect(leftover.rowCount).toBe(0);
  });

  it("refuses more than 8 weeks and leaves no rows behind", async () => {
    const db = await connection();
    await student(db);
    const topic = `Too long ${Date.now()}`;

    await expect(createWeekly(db, { weeks: 9, topic })).rejects.toMatchObject({
      message: expect.stringContaining("weeks_out_of_range"),
    });

    const leftover = await db.query(`select 1 from public.sessions where topic = $1`, [topic]);
    expect(leftover.rowCount).toBe(0);
  });

  it("accepts the top of the range", async () => {
    const db = await connection();
    await student(db);

    const { rows } = await createWeekly(db, { weeks: 8 });
    expect(rows).toHaveLength(8);
  });

  it("takes the host from the session, not a parameter", async () => {
    const db = await connection();
    const hostId = await student(db, "Real Host");

    // The function signature has no host argument -- the only way to be the
    // host is to be the caller. A second student cannot appear as host_id.
    const { rows } = await createWeekly(db, { weeks: 2 });
    expect(rows.map((row) => row.host_id)).toEqual([hostId, hostId]);
  });

  it("refuses a signed-out caller", async () => {
    const db = await connection();
    await db.query("set role anon");

    await expect(createWeekly(db, { weeks: 2 })).rejects.toMatchObject({
      // Either not_signed_in from the body, or 42501 from the grant (BUG-08).
      code: expect.stringMatching(/28000|42501/),
    });
  });

  // The reason this is not `starts_at + interval '7 days'`. On 2027-11-07
  // Chicago falls back from CDT to CST; +168 hours lands an hour early on
  // the wall, and students plan by the wall. (2026's transition is already
  // behind "today" for this project, so the fixture is next year's.)
  it("keeps the same Chicago wall-clock time across the November DST change", async () => {
    const db = await connection();
    await student(db);

    // Wednesday 3 Nov 2027, 14:00 America/Chicago (still CDT, UTC-5) --
    // four days before the fall-back. A week later is Wednesday 10 Nov 2027,
    // 14:00 America/Chicago (CST, UTC-6).
    const { rows } = await createWeekly(db, {
      weeks: 2,
      starts: "2027-11-03T19:00:00.000Z",
      ends: "2027-11-03T21:00:00.000Z",
      topic: `DST ${Date.now()}`,
    });

    expect(rows).toHaveLength(2);

    const chicago = await db.query<{ local_start: string; local_end: string }>(
      `select to_char(starts_at at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') as local_start,
              to_char(ends_at   at time zone 'America/Chicago', 'YYYY-MM-DD HH24:MI') as local_end
         from public.sessions
        where id = any($1::uuid[])
        order by starts_at`,
      [rows.map((row) => row.id)],
    );

    expect(chicago.rows).toEqual([
      { local_start: "2027-11-03 14:00", local_end: "2027-11-03 16:00" },
      // 14:00 again, not 13:00 -- that is what +168 hours would have produced.
      { local_start: "2027-11-10 14:00", local_end: "2027-11-10 16:00" },
    ]);

    // And in absolute time the gap is 169 hours, not 168.
    const gapHours =
      (rows[1]!.starts_at.getTime() - rows[0]!.starts_at.getTime()) / (60 * 60 * 1000);
    expect(gapHours).toBe(169);
  });

  it("refuses a series whose first start is already in the past", async () => {
    const db = await connection();
    await student(db);
    const topic = `Past ${Date.now()}`;
    const starts = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const ends = new Date(Date.now() + 90 * 60 * 1000).toISOString();

    await expect(createWeekly(db, { weeks: 2, starts, ends, topic })).rejects.toMatchObject({
      message: expect.stringContaining("starts_in_past"),
    });

    const leftover = await db.query(`select 1 from public.sessions where topic = $1`, [topic]);
    expect(leftover.rowCount).toBe(0);
  });
});
