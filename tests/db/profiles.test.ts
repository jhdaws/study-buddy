import type { Client, DatabaseError } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * A2's profile rules (supabase/migrations/*_profile_rules.sql):
 *
 *   - US-01b: only @vanderbilt.edu addresses can exist in auth.users, however
 *     they get there -- a direct insert here stands in for someone calling
 *     the Supabase auth API without our form.
 *   - Every new auth user gets a profiles row with no name and no email
 *     (US-25, ADR 0008 rule 16).
 *   - display_name mirrors displayNameSchema.
 *   - RLS and grants: signed-in users read profiles and update only their
 *     own display_name.
 *
 * Every test runs inside a transaction that is rolled back, so nothing is
 * left behind in the local database.
 *
 * HOW A TEST BECOMES A USER. Supabase's RLS reads the caller from the JWT
 * that PostgREST puts in `request.jwt.claims`, and runs the query as the role
 * named in it. `asUser()` does the same by hand: SET LOCAL ROLE plus the
 * claims, both scoped to the transaction.
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

/**
 * A Vanderbilt address no real account on the local database will have, so a
 * unique index on auth.users.email can never make a test fail by accident.
 */
function testEmail(name: string): string {
  return `${name}.a2test.${Math.random().toString(36).slice(2, 10)}@vanderbilt.edu`;
}

/** Insert an auth user directly, as Supabase Auth would. Returns its id. */
async function createUser(email: string | null): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email],
  );
  return rows[0].id;
}

type Attempt = { error?: DatabaseError; rowCount: number | null; rows: Record<string, unknown>[] };

/**
 * Run a statement that may fail, without aborting the test's transaction: a
 * savepoint is rolled back on error, and the error is returned, not thrown.
 */
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

/** Run `fn` as the Data API would for this user (null: signed out, `anon`). */
async function asUser<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  const role = userId ? "authenticated" : "anon";
  const claims = userId ? { sub: userId, role } : { role };
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify(claims),
  ]);
  try {
    return await fn();
  } finally {
    await db.query("reset role");
  }
}

async function displayNameOf(userId: string): Promise<string | null> {
  const { rows } = await db.query<{ display_name: string | null }>(
    "select display_name from public.profiles where id = $1",
    [userId],
  );
  return rows[0].display_name;
}

describe("signup is Vanderbilt-only (US-01b)", () => {
  it.each([
    "student@gmail.com",
    "student@vanderbilt.edu.evil.com",
    "student@notvanderbilt.edu",
    "student@mail.vanderbilt.edu",
    "student@vanderbilt.edu@gmail.com",
    "a@b@vanderbilt.edu",
    "@vanderbilt.edu",
    "studentvanderbilt.edu",
    "",
  ])("rejects %j", async (email) => {
    const { error } = await attempt(
      "insert into auth.users (id, email) values (gen_random_uuid(), $1)",
      [email],
    );
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain('"auth_users_vanderbilt_email"');
  });

  it("rejects a user with no email at all (phone or anonymous sign-up)", async () => {
    const { error } = await attempt(
      "insert into auth.users (id, email) values (gen_random_uuid(), null)",
    );
    expect(error?.code).toBe("23514");
  });

  it.each([
    ["a lowercase address", (email: string) => email],
    ["mixed case", (email: string) => email.replace("vanderbilt.edu", "Vanderbilt.EDU")],
    ["surrounding spaces", (email: string) => ` ${email} `],
  ])("accepts %s", async (_label, shape) => {
    const { error } = await attempt(
      "insert into auth.users (id, email) values (gen_random_uuid(), $1)",
      [shape(testEmail("student"))],
    );
    expect(error).toBeUndefined();
  });

  it("rejects changing an address to a non-Vanderbilt one, allows a Vanderbilt one", async () => {
    const id = await createUser(testEmail("student"));

    const away = await attempt("update auth.users set email = $2 where id = $1", [
      id,
      "student@gmail.com",
    ]);
    expect(away.error?.code).toBe("23514");

    const within = await attempt("update auth.users set email = $2 where id = $1", [
      id,
      testEmail("renamed"),
    ]);
    expect(within.error).toBeUndefined();
    expect(within.rowCount).toBe(1);
  });
});

describe("a profile is created at signup", () => {
  it("gives a new Vanderbilt user a profile with no display name yet", async () => {
    const id = await createUser(testEmail("newcomer"));
    const { rows } = await db.query("select id, display_name from public.profiles where id = $1", [
      id,
    ]);
    expect(rows).toEqual([{ id, display_name: null }]);
  });

  it("keeps email out of profiles (US-25, ADR 0008 rule 16)", async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles'
    `);
    const columns = rows.map((row) => row.column_name);
    expect(columns).toContain("display_name");
    expect(columns.filter((name) => /mail/i.test(name))).toEqual([]);
  });
});

describe("display_name CHECK mirrors displayNameSchema", () => {
  it.each([
    ["empty", ""],
    ["spaces only", "   "],
    ["a tab", "\t"],
    ["a no-break space", "\u00a0"],
    ["a leading space", " Sam"],
    ["a leading tab", "\tSam"],
    ["a leading no-break space", "\u00a0Sam"],
    ["a trailing space", "Sam "],
    ["a trailing newline", "Sam\n"],
    ["51 characters", "x".repeat(51)],
  ])("rejects %s", async (_label, name) => {
    const id = await createUser(testEmail("namer"));
    const { error } = await attempt(
      "update public.profiles set display_name = $2 where id = $1",
      [id, name],
    );
    expect(error?.code).toBe("23514");
    expect(error?.message).toContain('"profiles_display_name_check"');
  });

  it.each([
    ["one character", "S"],
    ["a name with inner spaces", "Mary Jane"],
    ["50 characters", "x".repeat(50)],
  ])("accepts %s", async (_label, name) => {
    const id = await createUser(testEmail("namer"));
    const { error } = await attempt(
      "update public.profiles set display_name = $2 where id = $1",
      [id, name],
    );
    expect(error).toBeUndefined();
    expect(await displayNameOf(id)).toBe(name);
  });
});

describe("who can read and write profiles", () => {
  let me: string;
  let someoneElse: string;

  beforeEach(async () => {
    me = await createUser(testEmail("me"));
    someoneElse = await createUser(testEmail("someone"));
    await db.query("update public.profiles set display_name = 'Someone' where id = $1", [
      someoneElse,
    ]);
  });

  it("lets a signed-in user read other students' display names", async () => {
    const rows = await asUser(me, async () => {
      const result = await db.query("select display_name from public.profiles where id = $1", [
        someoneElse,
      ]);
      return result.rows;
    });
    expect(rows).toEqual([{ display_name: "Someone" }]);
  });

  it("gives a signed-out visitor nothing", async () => {
    const { error } = await asUser(null, () => attempt("select * from public.profiles"));
    expect(error?.code).toBe("42501");
  });

  it("lets a user set their own display name", async () => {
    const { error, rowCount } = await asUser(me, () =>
      attempt("update public.profiles set display_name = 'Me' where id = $1", [me]),
    );
    expect(error).toBeUndefined();
    expect(rowCount).toBe(1);
    expect(await displayNameOf(me)).toBe("Me");
  });

  it("does not let a user change someone else's profile", async () => {
    const { error, rowCount } = await asUser(me, () =>
      attempt("update public.profiles set display_name = 'Hijacked' where id = $1", [
        someoneElse,
      ]),
    );
    // RLS hides the row from the update: no error, nothing changed.
    expect(error).toBeUndefined();
    expect(rowCount).toBe(0);
    expect(await displayNameOf(someoneElse)).toBe("Someone");
  });

  it("does not let a user change any column of their own row but display_name", async () => {
    // Only display_name is granted, so these fail on privileges before RLS
    // is consulted -- on the user's own row, which RLS alone would allow.
    for (const sql of [
      "update public.profiles set created_at = now() - interval '1 year' where id = $1",
      "update public.profiles set id = gen_random_uuid() where id = $1",
    ]) {
      const { error } = await asUser(me, () => attempt(sql, [me]));
      expect(error?.code, sql).toBe("42501");
      expect(error?.message, sql).toMatch(/permission denied/);
    }
  });

  it("does not let a user insert or delete profiles", async () => {
    const inserted = await asUser(me, () =>
      attempt("insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Ghost')"),
    );
    expect(inserted.error?.code).toBe("42501");

    const deleted = await asUser(me, () =>
      attempt("delete from public.profiles where id = $1", [me]),
    );
    expect(deleted.error?.code).toBe("42501");
  });
});
