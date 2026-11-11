import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * C1's session chat (supabase/migrations/*_session_chat.sql, US-05, US-05b):
 *
 *   - Everyone on the roster, host included, reads the session's messages and
 *     posts as themselves. author_id is the database's, never theirs to name.
 *   - Nobody else reads or posts: not a student who never joined, not one who
 *     left, not a signed-out caller (US-05b).
 *   - The chat is read-only once the session is cancelled or ended a week ago
 *     (ADR 0008 rule 4). Nobody edits or deletes a message.
 *   - A sender deleting their account leaves the message, authorless
 *     (ADR 0008 rule 5).
 *
 * Every test runs inside a transaction that is rolled back.
 */

let db: Client;

beforeAll(async () => {
  db = await connect();
});

afterAll(async () => {
  await db?.end();
});

beforeEach(async () => {
  await db.query("begin");
});

afterEach(async () => {
  await db.query("rollback");
});

type Attempt = { error?: DatabaseError; rowCount: number | null; rows: Record<string, unknown>[] };

async function attempt(sql: string, params: unknown[] = []): Promise<Attempt> {
  await db.query("savepoint attempt");
  try {
    const result = await db.query(sql, params);
    await db.query("release savepoint attempt");
    return { rowCount: result.rowCount, rows: result.rows };
  } catch (error) {
    await db.query("rollback to savepoint attempt");
    return { error: error as DatabaseError, rowCount: null, rows: [] };
  }
}

async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  const claims = userId ? { sub: userId, role } : { role };
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}

async function createStudent(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [`${name}.c1test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
  );
  await db.query("update public.profiles set display_name = $2 where id = $1", [rows[0].id, name]);
  return rows[0].id;
}

/**
 * A session hosted by `host`, with the host on the roster as create_session
 * would leave them. `endsIn` is an interval from now; negative for the past.
 */
async function createSession(host: string, endsIn = "2 hours"): Promise<string> {
  const { rows: course } = await db.query<{ id: string }>("select id from public.courses limit 1");
  const { rows: location } = await db.query<{ id: string }>(
    "insert into public.locations (place_id, lat, lng) values ($1, 36.14, -86.80) returning id",
    [`c1-${Math.random()}`],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into public.sessions (host_id, course_id, location_id, location_label, topic, starts_at, ends_at, capacity)
     values ($1, $2, $3, 'Library', 'C1 test', now() + $4::interval - interval '1 hour', now() + $4::interval, 4)
     returning id`,
    [host, course[0].id, location[0].id, endsIn],
  );
  await seat(rows[0].id, host);
  return rows[0].id;
}

const seat = (sessionId: string, userId: string) =>
  db.query("insert into public.session_attendees (session_id, user_id) values ($1, $2)", [sessionId, userId]);

/** What the Data API sends for sendMessage(): two columns, no author. */
const POST = "insert into public.session_messages (session_id, body) values ($1, $2)";

const post = (userId: string | null, sessionId: string, body = "Meet by the stairs?") =>
  asUser(userId, () => attempt(POST, [sessionId, body]));

const read = (userId: string | null, sessionId: string) =>
  asUser(userId, () =>
    attempt("select author_id, body from public.session_messages where session_id = $1 order by created_at", [
      sessionId,
    ]),
  );

let host: string;
let guest: string;
let outsider: string;
let session: string;

beforeEach(async () => {
  host = await createStudent("Host");
  guest = await createStudent("Guest");
  outsider = await createStudent("Outsider");
  session = await createSession(host);
  await seat(session, guest);
});

describe("attendees (US-05)", () => {
  it("lets the host and a guest post, as themselves, and read each other", async () => {
    expect((await post(host, session, "I'm at a table by the window")).error).toBeUndefined();
    expect((await post(guest, session, "On my way")).error).toBeUndefined();

    const forGuest = await read(guest, session);
    expect(forGuest.error).toBeUndefined();
    expect(forGuest.rows).toEqual([
      { author_id: host, body: "I'm at a table by the window" },
      { author_id: guest, body: "On my way" },
    ]);
    expect((await read(host, session)).rows).toEqual(forGuest.rows);
  });

  it("refuses naming another author", async () => {
    // No column privilege on author_id: the default, auth.uid(), is the only
    // value a client can give it.
    const { error } = await asUser(guest, () =>
      attempt("insert into public.session_messages (session_id, author_id, body) values ($1, $2, 'Hi')", [
        session,
        host,
      ]),
    );
    expect(error?.code).toBe("42501");
  });

  it("stamps created_at itself and refuses a backdated one", async () => {
    const { error } = await asUser(guest, () =>
      attempt(
        "insert into public.session_messages (session_id, body, created_at) values ($1, 'Hi', now() - interval '1 year')",
        [session],
      ),
    );
    expect(error?.code).toBe("42501");

    await post(guest, session);
    const { rows } = await db.query(
      "select created_at > now() - interval '1 minute' as fresh from public.session_messages where session_id = $1",
      [session],
    );
    expect(rows).toEqual([{ fresh: true }]);
  });

  it("lets nobody edit or delete a message, their own included", async () => {
    await post(guest, session, "Original");

    const edit = await asUser(guest, () =>
      attempt("update public.session_messages set body = 'Edited' where session_id = $1", [session]),
    );
    expect(edit.error?.code).toBe("42501");

    const remove = await asUser(guest, () =>
      attempt("delete from public.session_messages where session_id = $1", [session]),
    );
    expect(remove.error?.code).toBe("42501");

    const { rows } = await db.query("select body from public.session_messages where session_id = $1", [session]);
    expect(rows).toEqual([{ body: "Original" }]);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["padded", " hi "],
    ["ending in a newline", "hi\n"],
    ["over 1000 characters", "x".repeat(1001)],
  ])("refuses a body that is %s (session_messages_body_check)", async (_label, body) => {
    const { error } = await post(guest, session, body);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain("session_messages_body_check");
  });

  it("accepts 1000 characters, and line breaks inside a message", async () => {
    expect((await post(guest, session, "x".repeat(1000))).error).toBeUndefined();
    expect((await post(guest, session, "Room 204\nsecond floor")).error).toBeUndefined();
  });
});

describe("everyone else (US-05b)", () => {
  beforeEach(async () => {
    await post(host, session, "Bring the problem set");
  });

  it("gives a signed-in student who has not joined no rows, and refuses their post", async () => {
    const reading = await read(outsider, session);
    expect(reading.error).toBeUndefined();
    expect(reading.rows).toEqual([]);

    const posting = await post(outsider, session);
    expect(posting.error?.code).toBe("42501");
  });

  it("closes the chat to a student who leaves", async () => {
    await db.query("delete from public.session_attendees where session_id = $1 and user_id = $2", [session, guest]);

    expect((await read(guest, session)).rows).toEqual([]);
    expect((await post(guest, session)).error?.code).toBe("42501");
  });

  it("gives a signed-out caller no privilege at all", async () => {
    expect((await read(null, session)).error?.message).toMatch(/permission denied/);
    expect((await post(null, session)).error?.message).toMatch(/permission denied/);
  });

  it("does not leak one session's chat into another's", async () => {
    const other = await createSession(outsider);
    await post(outsider, other, "Different session");

    expect((await read(guest, other)).rows).toEqual([]);
    expect((await read(guest, session)).rows).toEqual([{ author_id: host, body: "Bring the problem set" }]);
  });
});

describe("when the chat closes (ADR 0008 rule 4)", () => {
  it("stays open for a week after the session ends", async () => {
    const ended = await createSession(host, "-6 days");
    await seat(ended, guest);
    expect((await post(guest, ended)).error).toBeUndefined();
  });

  it("is read-only once the session ended more than a week ago", async () => {
    const old = await createSession(host, "-8 days");
    await seat(old, guest);
    await db.query("insert into public.session_messages (session_id, author_id, body) values ($1, $2, 'Back then')", [
      old,
      host,
    ]);

    expect((await post(guest, old)).error?.code).toBe("42501");
    expect((await read(guest, old)).rows).toEqual([{ author_id: host, body: "Back then" }]);
  });

  it("is read-only once the session is cancelled", async () => {
    await post(guest, session, "Before");
    await db.query("update public.sessions set status = 'cancelled' where id = $1", [session]);

    expect((await post(guest, session, "After")).error?.code).toBe("42501");
    expect((await read(guest, session)).rows).toEqual([{ author_id: guest, body: "Before" }]);
  });
});

describe("deletions (ADR 0008 rule 5)", () => {
  it("keeps a deleted account's messages, with no author", async () => {
    await post(guest, session, "See you there");
    await db.query("delete from auth.users where id = $1", [guest]);

    expect((await read(host, session)).rows).toEqual([{ author_id: null, body: "See you there" }]);
  });

  it("takes a deleted session's chat with it", async () => {
    await post(guest, session);
    await db.query("delete from public.sessions where id = $1", [session]);

    const { rows } = await db.query("select count(*)::int as n from public.session_messages where session_id = $1", [
      session,
    ]);
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("Realtime (US-05)", () => {
  it("keeps the default replica identity, so a DELETE event carries only the message id", async () => {
    const { rows } = await db.query<{ identity: string }>(
      `select c.relreplident as identity
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'session_messages'`,
    );
    expect(rows).toEqual([{ identity: "d" }]);
  });

  it("grants signed-out (anon) clients nothing, and signed-in ones only SELECT and two INSERT columns", async () => {
    const { rows: anon } = await db.query(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public' and table_name = 'session_messages'`,
    );
    expect(anon).toEqual([]);

    const { rows: table } = await db.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where grantee = 'authenticated' and table_schema = 'public' and table_name = 'session_messages'
        order by privilege_type`,
    );
    expect(table.map((row) => row.privilege_type)).toEqual(["SELECT"]);

    const { rows: columns } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.column_privileges
        where grantee = 'authenticated' and table_schema = 'public' and table_name = 'session_messages'
          and privilege_type = 'INSERT'
        order by column_name`,
    );
    expect(columns.map((row) => row.column_name)).toEqual(["body", "session_id"]);
  });
});
