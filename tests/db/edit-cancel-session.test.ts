import type { Client } from "pg";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { createUser, signInAs } from "./auth-fixtures";
import { connect } from "./connection";

/**
 * S7 -- update_session() and cancel_session() (US-09),
 * supabase/migrations/20261110163727_s7_edit_cancel_session.sql.
 *
 * The test this file exists for is "a non-host is refused": the host is taken
 * from auth.uid() and compared against the stored host_id, so no parameter a
 * client controls can make it edit or cancel someone else's session. Both
 * functions get that test, and both get the direct-UPDATE test beside it --
 * there is no UPDATE policy on `sessions`, so the functions are the only way
 * in, and a regression in either half would reopen the same hole.
 *
 * Run against a real database: `npm run db:start && npm run test:db`.
 * Harness as in join-leave-session.test.ts (connection.ts, auth-fixtures.ts).
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
let otherCourseId: string;
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

    // A second course, so the "an edit can move the course" case changes
    // something a foreign key will actually accept.
    const otherCourse = await db.query<{ id: string }>(`
      insert into public.courses (department_code, number, title)
      values ('CS', '3251', 'Intermediate Software Design')
      on conflict (department_code, number) do update set title = excluded.title
      returning id
    `);
    otherCourseId = otherCourse.rows[0].id;

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

/** As the database's own role, bypassing RLS -- for setup the RPCs refuse on purpose. */
async function asServer<T>(db: Client, fn: () => Promise<T>): Promise<T> {
  await db.query("reset role");
  try {
    return await fn();
  } finally {
    await db.query("set role authenticated");
  }
}

/** A session hosted by `hostId` (signed in on `db`), seated as its first attendee. */
async function hostSession(
  db: Client,
  hostId: string,
  options: { capacity?: number; startsInMinutes?: number; endsInMinutes?: number } = {},
): Promise<string> {
  const startsAt = new Date(Date.now() + (options.startsInMinutes ?? 60) * 60 * 1000);
  const endsAt = new Date(Date.now() + (options.endsInMinutes ?? 120) * 60 * 1000);
  const capacity = options.capacity ?? 4;

  // A session in the past cannot be created through create_session (it
  // refuses starts_in_past), so set those up directly, as
  // join-leave-session.test.ts does.
  if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
    return asServer(db, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.sessions
           (host_id, course_id, location_id, location_label, room, topic, starts_at, ends_at, capacity)
         values ($1, $2, $3, 'Featheringill Hall', '134', 'Sprint 4 edit/cancel', $4, $5, $6)
         returning id`,
        [hostId, courseId, locationId, startsAt.toISOString(), endsAt.toISOString(), capacity],
      );
      const id = inserted.rows[0].id;
      await db.query(`insert into public.session_attendees (session_id, user_id) values ($1, $2)`, [
        id,
        hostId,
      ]);
      return id;
    });
  }

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
      "Sprint 4 edit/cancel",
      startsAt.toISOString(),
      endsAt.toISOString(),
      capacity,
    ],
  );
  return rows[0].id;
}

type EditOverrides = {
  courseId?: string;
  locationLabel?: string;
  room?: string;
  topic?: string;
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
};

/** Call update_session, defaulting every field to something valid. */
async function updateSession(db: Client, sessionId: string, overrides: EditOverrides = {}) {
  const startsAt = overrides.startsAt ?? new Date(Date.now() + 90 * 60 * 1000);
  const endsAt = overrides.endsAt ?? new Date(Date.now() + 150 * 60 * 1000);

  return db.query(
    `select * from public.update_session(
       $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text,
       $7::timestamptz, $8::timestamptz, $9::integer
     )`,
    [
      sessionId,
      overrides.courseId ?? courseId,
      locationId,
      overrides.locationLabel ?? "Featheringill Hall",
      overrides.room ?? "134",
      overrides.topic ?? "Sprint 4 edit/cancel",
      startsAt.toISOString(),
      endsAt.toISOString(),
      overrides.capacity ?? 4,
    ],
  );
}

async function cancelSession(db: Client, sessionId: string) {
  return db.query("select * from public.cancel_session($1)", [sessionId]);
}

async function statusOf(db: Client, sessionId: string): Promise<string> {
  const { rows } = await db.query<{ status: string }>(
    "select status from public.sessions where id = $1",
    [sessionId],
  );
  return rows[0].status;
}

/** A host and an unrelated signed-in student, each on their own connection. */
async function hostAndStranger() {
  const host = await connection();
  const hostId = await createUser(host, { displayName: "Jamie Host" });
  await signInAs(host, hostId);

  const stranger = await connection();
  const strangerId = await createUser(stranger, { displayName: "Alex Student" });
  await signInAs(stranger, strangerId);

  return { host, hostId, stranger, strangerId };
}

describe("update_session (S7, US-09)", () => {
  it("rejects when no one is signed in", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    await expect(updateSession(db, sessionId)).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a made-up session id", async () => {
    const { stranger } = await hostAndStranger();
    await expect(
      updateSession(stranger, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/session_not_found/);
  });

  it("IDOR: refuses a signed-in student who is not the host, and changes nothing", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(updateSession(stranger, sessionId, { topic: "Hijacked" })).rejects.toThrow(
      /not_session_host/,
    );

    const { rows } = await host.query<{ topic: string }>(
      "select topic from public.sessions where id = $1",
      [sessionId],
    );
    expect(rows[0].topic).toBe("Sprint 4 edit/cancel");
  });

  it("IDOR: refuses an attendee of the same session -- being on the roster is not hosting", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    await stranger.query("select public.join_session($1)", [sessionId]);

    await expect(updateSession(stranger, sessionId, { topic: "Hijacked" })).rejects.toThrow(
      /not_session_host/,
    );
  });

  it("rejects editing a cancelled session", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    await cancelSession(host, sessionId);

    await expect(updateSession(host, sessionId)).rejects.toThrow(/session_cancelled/);
  });

  it("rejects editing a session that has already ended", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId, {
      startsInMinutes: -120,
      endsInMinutes: -60,
    });

    await expect(updateSession(host, sessionId)).rejects.toThrow(/session_ended/);
  });

  it("refuses a capacity below the students already on the roster", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId, { capacity: 4 });
    await stranger.query("select public.join_session($1)", [sessionId]);

    // Host + one attendee = 2 on the roster; 2 is allowed, 1 is not. (1 would
    // also fail sessions_capacity_min, so use a roster of 3 to separate them.)
    const third = await connection();
    const thirdId = await createUser(third, { displayName: "Sam Student" });
    await signInAs(third, thirdId);
    await third.query("select public.join_session($1)", [sessionId]);

    await expect(updateSession(host, sessionId, { capacity: 2 })).rejects.toThrow(
      /capacity_below_roster/,
    );

    // Exactly the roster size is fine: nobody has to be removed.
    await expect(updateSession(host, sessionId, { capacity: 3 })).resolves.toBeDefined();
  });

  it("refuses a capacity below 2 through the CHECK, not the roster rule", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(updateSession(host, sessionId, { capacity: 1 })).rejects.toThrow(
      /sessions_capacity_min/,
    );
  });

  it("refuses an end time at or before the start through the CHECK", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    const startsAt = new Date(Date.now() + 90 * 60 * 1000);

    await expect(
      updateSession(host, sessionId, { startsAt, endsAt: startsAt }),
    ).rejects.toThrow(/sessions_ends_after_starts/);
  });

  it("refuses a blank topic through the CHECK", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(updateSession(host, sessionId, { topic: "   " })).rejects.toThrow(
      /sessions_topic_length/,
    );
  });

  it("refuses moving the start into the past", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(
      updateSession(host, sessionId, {
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        endsAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).rejects.toThrow(/starts_in_past/);
  });

  it("lets the host fix the topic of a session already in progress without moving its start", async () => {
    const { host, hostId } = await hostAndStranger();
    // Started 10 minutes ago, ends in an hour: in progress, not ended.
    const sessionId = await hostSession(host, hostId, {
      startsInMinutes: -10,
      endsInMinutes: 60,
    });
    const { rows: before } = await host.query<{ starts_at: Date; ends_at: Date }>(
      "select starts_at, ends_at from public.sessions where id = $1",
      [sessionId],
    );

    // The start is unchanged, so the "not in the past" rule does not apply --
    // otherwise a typo in a running session could never be fixed.
    await expect(
      updateSession(host, sessionId, {
        topic: "Sprint 4 edit/cancel (fixed)",
        startsAt: before[0].starts_at,
        endsAt: before[0].ends_at,
      }),
    ).resolves.toBeDefined();
  });

  it("saves the host's changes and returns the updated row", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    const startsAt = new Date(Date.now() + 180 * 60 * 1000);
    const endsAt = new Date(Date.now() + 240 * 60 * 1000);

    const { rows } = await updateSession(host, sessionId, {
      courseId: otherCourseId,
      topic: "Exam 2 review",
      locationLabel: "Sarratt Student Center",
      room: "216",
      startsAt,
      endsAt,
      capacity: 6,
    });

    expect(rows[0]).toEqual(
      expect.objectContaining({
        id: sessionId,
        host_id: hostId,
        course_id: otherCourseId,
        topic: "Exam 2 review",
        location_label: "Sarratt Student Center",
        room: "216",
        capacity: 6,
        status: "open",
      }),
    );
  });

  it("stores a blank room as null, as create_session does", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    const { rows } = await updateSession(host, sessionId, { room: "   " });
    expect(rows[0].room).toBeNull();
  });
});

describe("cancel_session (S7, US-09)", () => {
  it("rejects when no one is signed in", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    const db = await connection();
    await expect(cancelSession(db, sessionId)).rejects.toThrow(/not_signed_in/);
  });

  it("rejects a made-up session id", async () => {
    const { stranger } = await hostAndStranger();
    await expect(
      cancelSession(stranger, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/session_not_found/);
  });

  it("IDOR: refuses a signed-in student who is not the host, and leaves it open", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(cancelSession(stranger, sessionId)).rejects.toThrow(/not_session_host/);
    expect(await statusOf(host, sessionId)).toBe("open");
  });

  it("IDOR: refuses an attendee of the same session", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    await stranger.query("select public.join_session($1)", [sessionId]);

    await expect(cancelSession(stranger, sessionId)).rejects.toThrow(/not_session_host/);
    expect(await statusOf(host, sessionId)).toBe("open");
  });

  it("rejects cancelling twice", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await cancelSession(host, sessionId);
    await expect(cancelSession(host, sessionId)).rejects.toThrow(/session_cancelled/);
  });

  it("rejects cancelling a session that has already ended", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId, {
      startsInMinutes: -120,
      endsInMinutes: -60,
    });

    await expect(cancelSession(host, sessionId)).rejects.toThrow(/session_ended/);
  });

  it("cancels the session and keeps the roster, so attendees still see what happened", async () => {
    const { host, hostId, stranger } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);
    await stranger.query("select public.join_session($1)", [sessionId]);

    const { rows } = await cancelSession(host, sessionId);
    expect(rows[0]).toEqual(expect.objectContaining({ id: sessionId, status: "cancelled" }));

    const { rows: roster } = await host.query<{ count: string }>(
      "select count(*) from public.session_attendees where session_id = $1",
      [sessionId],
    );
    expect(Number(roster[0].count)).toBe(2);
  });

  it("a cancelled session leaves the session list", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    // listSessions() (src/lib/sessions.ts) selects status = 'open' and
    // ends_at > now(); this is that predicate.
    const inList = async () => {
      const { rows } = await host.query<{ count: string }>(
        `select count(*) from public.sessions
         where id = $1 and status = 'open' and ends_at > now()`,
        [sessionId],
      );
      return Number(rows[0].count);
    };

    expect(await inList()).toBe(1);
    await cancelSession(host, sessionId);
    expect(await inList()).toBe(0);
  });
});

describe("grants on update_session and cancel_session (S7)", () => {
  it("refuses anon EXECUTE on update_session", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    const anon = await connection();
    await anon.query("set role anon");
    await expect(updateSession(anon, sessionId)).rejects.toThrow(/permission denied/);
  });

  it("refuses anon EXECUTE on cancel_session", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    const anon = await connection();
    await anon.query("set role anon");
    await expect(cancelSession(anon, sessionId)).rejects.toThrow(/permission denied/);
  });

  it("refuses a direct client UPDATE on sessions -- the functions are the only way in", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    // Since SEC-14 the client role has no UPDATE on sessions at all, so this
    // is refused outright (before, RLS matched 0 rows). The host's own
    // connection, to show that even the owner cannot bypass the function.
    await expect(
      host.query("update public.sessions set topic = 'Direct write' where id = $1", [sessionId]),
    ).rejects.toMatchObject({ code: "42501" });

    const { rows } = await host.query<{ topic: string }>(
      "select topic from public.sessions where id = $1",
      [sessionId],
    );
    expect(rows[0].topic).toBe("Sprint 4 edit/cancel");
  });

  it("refuses a direct client UPDATE that only sets status -- cancelling needs the function", async () => {
    const { host, hostId } = await hostAndStranger();
    const sessionId = await hostSession(host, hostId);

    await expect(
      host.query("update public.sessions set status = 'cancelled' where id = $1", [sessionId]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(await statusOf(host, sessionId)).toBe("open");
  });
});
