import type { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { connect } from "./connection";

/**
 * A2 (#15) -- the rules on `profiles` and on signup.
 *
 * These go through the database directly, as an attacker would: ADR 0003 puts
 * the Vanderbilt-only rule in a trigger precisely because the client and the
 * server action can both be bypassed by anyone calling the Supabase auth API
 * with their own key. A test that went through signIn() would prove nothing
 * about US-01b.
 *
 * RLS is checked by becoming `authenticated` with a chosen `sub` claim, which
 * is what auth.uid() reads. Connecting as `postgres` bypasses RLS, so every
 * policy test must switch role explicitly or it passes for the wrong reason.
 */

let db: Client;

/** auth.users rows made by these tests; deleting one cascades to its profile. */
const created: string[] = [];

beforeAll(async () => {
  db = await connect();
});

afterEach(async () => {
  // Each test leaves the connection at the default role, whatever it did.
  await db.query("reset role");
});

afterAll(async () => {
  if (created.length > 0) {
    await db.query("delete from auth.users where id = any($1::uuid[])", [
      created,
    ]);
  }
  await db?.end();
});

/** Sign a user up the way GoTrue does: straight into auth.users. */
async function signUp(email: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email],
  );
  created.push(rows[0].id);
  return rows[0].id;
}

/**
 * Run `work` as `authenticated` with `sub` set to `userId`, then undo
 * everything. `set local` and `set_config(..., true)` are both transaction
 * scoped, so the rollback restores the role and the claims together.
 */
async function asUser<T>(userId: string, work: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    // Claims first, then the role: once we are `authenticated` we have fewer
    // rights, and the order makes no difference to what auth.uid() returns.
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
    await db.query("set local role authenticated");
    return await work();
  } finally {
    await db.query("rollback");
  }
}

describe("signup domain restriction (US-01, US-01b)", () => {
  it("rejects a non-Vanderbilt address inserted directly", async () => {
    // US-01b: the UI is not in the loop here at all.
    await expect(signUp("someone@gmail.com")).rejects.toThrow(
      /@vanderbilt\.edu/,
    );
  });

  it("rejects a Vanderbilt subdomain, as signInSchema does", async () => {
    await expect(signUp("someone@mail.vanderbilt.edu")).rejects.toThrow(
      /@vanderbilt\.edu/,
    );
  });

  it("rejects a null email", async () => {
    await expect(
      db.query("insert into auth.users (id) values (gen_random_uuid())"),
    ).rejects.toThrow(/@vanderbilt\.edu/);
  });

  it("accepts a Vanderbilt address whatever its case", async () => {
    const id = await signUp("Mixed.Case@Vanderbilt.EDU");
    expect(id).toBeTruthy();
  });
});

describe("profile creation on signup (ADR 0008 rule 1)", () => {
  it("creates exactly one profile row, with no display name yet", async () => {
    const id = await signUp("new.student@vanderbilt.edu");

    const { rows } = await db.query<{ display_name: string | null }>(
      "select display_name from public.profiles where id = $1",
      [id],
    );

    expect(rows).toHaveLength(1);
    // Null until A4's name step. S1 refuses a session from a nameless profile.
    expect(rows[0].display_name).toBeNull();
  });

  it("removes the profile when the auth user goes away", async () => {
    const id = await signUp("transient@vanderbilt.edu");
    await db.query("delete from auth.users where id = $1", [id]);

    const { rowCount } = await db.query(
      "select 1 from public.profiles where id = $1",
      [id],
    );
    expect(rowCount).toBe(0);
  });
});

describe("display_name CHECK (mirrors displayNameSchema)", () => {
  async function setName(id: string, name: string) {
    return db.query("update public.profiles set display_name = $1 where id = $2", [
      name,
      id,
    ]);
  }

  it("accepts a normal name", async () => {
    const id = await signUp("named@vanderbilt.edu");
    const { rowCount } = await setName(id, "Priya");
    expect(rowCount).toBe(1);
  });

  it("rejects a whitespace-only name", async () => {
    // Would otherwise count as "set" and render as a blank host.
    const id = await signUp("blank.name@vanderbilt.edu");
    await expect(setName(id, "   ")).rejects.toThrow(
      /profiles_display_name_length/,
    );
  });

  it("accepts a name at the 50-character limit", async () => {
    const id = await signUp("longest@vanderbilt.edu");
    const { rowCount } = await setName(id, "a".repeat(50));
    expect(rowCount).toBe(1);
  });

  it("rejects a name one character over the limit", async () => {
    // DISPLAY_NAME_MAX_LENGTH in src/lib/limits.ts.
    const id = await signUp("toolong@vanderbilt.edu");
    await expect(setName(id, "a".repeat(51))).rejects.toThrow(
      /profiles_display_name_length/,
    );
  });
});

describe("profiles RLS (ADR 0008 rule 10)", () => {
  it("lets a signed-in user read another person's display name", async () => {
    // What S4 needs for hostDisplayName on the session list.
    const reader = await signUp("reader@vanderbilt.edu");
    const host = await signUp("host@vanderbilt.edu");
    await db.query("update public.profiles set display_name = 'Marcus' where id = $1", [
      host,
    ]);

    const name = await asUser(reader, async () => {
      const { rows } = await db.query<{ display_name: string | null }>(
        "select display_name from public.profiles where id = $1",
        [host],
      );
      return rows[0]?.display_name;
    });

    expect(name).toBe("Marcus");
  });

  it("shows a signed-out visitor nothing at all", async () => {
    await signUp("private@vanderbilt.edu");

    await db.query("begin");
    try {
      await db.query("set local role anon");
      const { rowCount } = await db.query("select 1 from public.profiles");
      // No policy grants `anon` anything, so RLS filters every row.
      expect(rowCount).toBe(0);
    } finally {
      await db.query("rollback");
    }
  });

  it("lets a user set their own display name", async () => {
    const id = await signUp("self.edit@vanderbilt.edu");

    const rowCount = await asUser(id, async () => {
      const result = await db.query(
        "update public.profiles set display_name = 'Jordan' where id = $1",
        [id],
      );
      return result.rowCount;
    });

    expect(rowCount).toBe(1);
  });

  it("does not let a user edit someone else's profile", async () => {
    const attacker = await signUp("attacker@vanderbilt.edu");
    const victim = await signUp("victim@vanderbilt.edu");
    await db.query("update public.profiles set display_name = 'Victim' where id = $1", [
      victim,
    ]);

    const rowCount = await asUser(attacker, async () => {
      const result = await db.query(
        "update public.profiles set display_name = 'Owned' where id = $1",
        [victim],
      );
      // RLS filters the row out rather than raising: the update matches nothing.
      return result.rowCount;
    });

    expect(rowCount).toBe(0);

    const { rows } = await db.query<{ display_name: string | null }>(
      "select display_name from public.profiles where id = $1",
      [victim],
    );
    expect(rows[0].display_name).toBe("Victim");
  });

  it("does not let a user move their profile onto someone else's id", async () => {
    // What `with check` is for: `using` alone would allow this.
    const mover = await signUp("mover@vanderbilt.edu");
    const target = await signUp("target@vanderbilt.edu");

    // Drop the target's profile first, so the id is free of both the primary
    // key and the foreign key. Otherwise this test can pass on a duplicate-key
    // error without the policy being consulted at all.
    await db.query("delete from public.profiles where id = $1", [target]);

    await expect(
      asUser(mover, () =>
        db.query("update public.profiles set id = $1 where id = $2", [
          target,
          mover,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("does not let a user insert a profile row directly", async () => {
    // Rows come from the signup trigger only; there is no INSERT policy.
    const id = await signUp("inserter@vanderbilt.edu");

    const rejected = await asUser(id, async () => {
      try {
        await db.query(
          "insert into public.profiles (id) values (gen_random_uuid())",
        );
        return false;
      } catch {
        return true;
      }
    });

    expect(rejected).toBe(true);
  });

  it("does not let a user delete a profile", async () => {
    // No DELETE policy: profiles go away through the auth.users cascade.
    const id = await signUp("deleter@vanderbilt.edu");

    const rowCount = await asUser(id, async () => {
      const result = await db.query(
        "delete from public.profiles where id = $1",
        [id],
      );
      return result.rowCount;
    });

    expect(rowCount).toBe(0);
  });
});
