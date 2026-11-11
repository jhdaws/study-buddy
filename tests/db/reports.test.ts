import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * P3's reports (supabase/migrations/*_reports.sql, US-18):
 *
 *   - A signed-in student may file a report as themselves -- reporter_id is
 *     the database's, never theirs to name -- about someone else.
 *   - Nobody but the team (the `postgres` role, in the dashboard) reads,
 *     changes or deletes a report; signed-out callers can do nothing.
 *   - At most 5 per student per rolling day.
 *   - Reports survive either side deleting their account (US-24).
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
    [`${name}.p3test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`],
  );
  await db.query("update public.profiles set display_name = $2 where id = $1", [rows[0].id, name]);
  return rows[0].id;
}

/** What the Data API sends for reportUser(): the four columns, no reporter. */
const REPORT = "insert into public.reports (reported_user_id, reason, note) values ($1, $2, $3)";

const report = (reporter: string, reported: string, reason = "harassment", note: string | null = null) =>
  asUser(reporter, () => attempt(REPORT, [reported, reason, note]));

let me: string;
let sam: string;
let alex: string;

beforeEach(async () => {
  me = await createStudent("Me");
  sam = await createStudent("Sam");
  alex = await createStudent("Alex");
});

describe("filing a report", () => {
  it("files it as the caller, timestamped now", async () => {
    const { error } = await report(me, sam, "safety", "Followed me out of the library");
    expect(error).toBeUndefined();

    const { rows } = await db.query(
      `select reporter_id, reported_user_id, reason, note, created_at > now() - interval '1 minute' as fresh
         from public.reports where reported_user_id = $1`,
      [sam],
    );
    expect(rows).toEqual([
      { reporter_id: me, reported_user_id: sam, reason: "safety", note: "Followed me out of the library", fresh: true },
    ]);
  });

  it("can name the session it came from", async () => {
    const { rows: course } = await db.query<{ id: string }>("select id from public.courses limit 1");
    const { rows: location } = await db.query<{ id: string }>(
      "insert into public.locations (place_id, lat, lng) values ($1, 36.14, -86.80) returning id",
      [`p3-${Math.random()}`],
    );
    const { rows: session } = await db.query<{ id: string }>(
      `insert into public.sessions (host_id, course_id, location_id, location_label, topic, starts_at, ends_at, capacity)
       values ($1, $2, $3, 'Library', 'P3 test', now() + interval '1 hour', now() + interval '2 hours', 4)
       returning id`,
      [sam, course[0].id, location[0].id],
    );
    const { error } = await asUser(me, () =>
      attempt("insert into public.reports (reported_user_id, session_id, reason) values ($1, $2, 'spam')", [
        sam,
        session[0].id,
      ]),
    );
    expect(error).toBeUndefined();
  });

  it("refuses a report about yourself", async () => {
    const { error } = await report(me, me);
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/row-level security/);
  });

  it("refuses a report about nobody", async () => {
    const { error } = await asUser(me, () =>
      attempt("insert into public.reports (reported_user_id, reason) values (null, 'other')"),
    );
    expect(error?.code).toBe("42501");
  });

  it("refuses a forged reporter: the column cannot be named", async () => {
    const { error } = await asUser(me, () =>
      attempt("insert into public.reports (reporter_id, reported_user_id, reason) values ($1, $2, 'spam')", [
        alex,
        sam,
      ]),
    );
    expect(error?.code).toBe("42501");
    expect(error?.message).toMatch(/permission denied/);
  });

  it("refuses a backdated report", async () => {
    const { error } = await asUser(me, () =>
      attempt(
        "insert into public.reports (reported_user_id, reason, created_at) values ($1, 'spam', now() - interval '2 days')",
        [sam],
      ),
    );
    expect(error?.code).toBe("42501");
  });

  it("refuses a signed-out caller", async () => {
    const { error } = await asUser(null, () => attempt(REPORT, [sam, "spam", null]));
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["a note over 500 characters", "x".repeat(501), "reports_note_length"],
    ["a blank note", "   ", "reports_note_length"],
  ])("refuses %s", async (_label, note, constraint) => {
    const { error } = await report(me, sam, "other", note);
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain(`"${constraint}"`);
  });

  it("accepts a 500-character note", async () => {
    const { error } = await report(me, sam, "other", "x".repeat(500));
    expect(error).toBeUndefined();
  });

  it("refuses a reason the enum does not have", async () => {
    const { error } = await report(me, sam, "rude");
    expect(error?.code).toBe("22P02");
  });
});

describe("nobody but the team reads reports", () => {
  beforeEach(async () => {
    await report(me, sam);
  });

  it.each([
    ["read them", "select * from public.reports"],
    ["read even their own", "select reason from public.reports where reporter_id = auth.uid()"],
    ["change them", "update public.reports set reason = 'other'"],
    ["delete them", "delete from public.reports"],
    ["truncate them", "truncate public.reports"],
  ])("refuses a signed-in student who tries to %s", async (_label, sql) => {
    const { error } = await asUser(me, () => attempt(sql));
    expect(error?.code, sql).toBe("42501");
  });

  it("refuses the reported student too", async () => {
    const { error } = await asUser(sam, () => attempt("select * from public.reports"));
    expect(error?.code).toBe("42501");
  });

  it("grants clients nothing but INSERT of the four form columns", async () => {
    const { rows: tableGrants } = await db.query(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'reports' and grantee in ('anon', 'authenticated')`,
    );
    expect(tableGrants).toEqual([]);

    const { rows: columnGrants } = await db.query<{ grantee: string; privilege_type: string; column_name: string }>(
      `select grantee, privilege_type, column_name from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'reports' and grantee in ('anon', 'authenticated')
        order by column_name`,
    );
    expect(columnGrants).toEqual(
      ["note", "reason", "reported_user_id", "session_id"].map((column_name) => ({
        grantee: "authenticated",
        privilege_type: "INSERT",
        column_name,
      })),
    );
  });

  it("has RLS on", async () => {
    const { rows } = await db.query("select relrowsecurity as rls from pg_class where oid = 'public.reports'::regclass");
    expect(rows).toEqual([{ rls: true }]);
  });
});

describe("at most 5 reports a day", () => {
  it("refuses the sixth with report_limit_reached (HTTP 429)", async () => {
    for (let i = 0; i < 5; i += 1) {
      const { error } = await report(me, i % 2 ? sam : alex);
      expect(error, `report ${i + 1}`).toBeUndefined();
    }
    const sixth = await report(me, sam);
    expect(sixth.error?.code).toBe("PT429");
    expect(sixth.error?.message).toBe("report_limit_reached");
  });

  it("counts a rolling day: reports older than 24 hours do not count", async () => {
    for (let i = 0; i < 5; i += 1) await report(me, sam);
    // Age them as the team could; clients cannot update reports at all.
    await db.query("update public.reports set created_at = now() - interval '25 hours' where reporter_id = $1", [me]);
    const { error } = await report(me, sam);
    expect(error).toBeUndefined();
  });

  it("counts each student separately", async () => {
    for (let i = 0; i < 5; i += 1) await report(me, sam);
    const { error } = await report(alex, sam);
    expect(error).toBeUndefined();
  });
});

describe("reports and deleted accounts (US-24)", () => {
  it("keeps a report when the reporter deletes their account", async () => {
    await report(me, sam, "safety", "Kept");
    await db.query("delete from auth.users where id = $1", [me]);
    const { rows } = await db.query("select reporter_id, reported_user_id, note from public.reports where note = 'Kept'");
    expect(rows).toEqual([{ reporter_id: null, reported_user_id: sam, note: "Kept" }]);
  });

  it("keeps it when the reported student deletes theirs", async () => {
    await report(me, sam, "safety", "Kept");
    await db.query("delete from auth.users where id = $1", [sam]);
    const { rows } = await db.query("select reporter_id, reported_user_id from public.reports where note = 'Kept'");
    expect(rows).toEqual([{ reporter_id: me, reported_user_id: null }]);
  });

  it("does not block deleting both accounts", async () => {
    await report(me, sam, "safety", "Kept");
    await db.query("delete from auth.users where id = $1", [me]);
    const { error } = await attempt("delete from auth.users where id = $1", [sam]);
    expect(error).toBeUndefined();
  });
});
