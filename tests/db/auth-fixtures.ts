// Test-only helpers for acting as a signed-in user against the LOCAL
// database. These tests talk to Postgres directly (connection.ts), not
// through PostgREST, so there is no real Supabase Auth session to sign in
// with -- this fakes just enough of one for RLS and auth.uid() to see a
// caller: an auth.users row (minimal columns) and the request.jwt.claims /
// request.jwt.claim.sub settings auth.uid() reads.
//
// Verified against a hand-built plain-Postgres stand-in for Supabase (no
// Docker in the environment this was written in -- see HANDOFF.md), not the
// real local stack: the auth.users insert below is the common shape used for
// this across Supabase projects, and worked against that stand-in's auth
// schema, but was never checked against GoTrue's real one. If
// `npm run test:db` fails here for real with a NOT NULL or type error on an
// auth.users column, start by loosening or filling in that column.

import type { Client } from "pg";

/** Inserts a minimal real auth.users row and a matching profiles row. Returns its id. */
export async function createUser(
  db: Client,
  options: { displayName?: string | null } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated',
      'test-' || gen_random_uuid() || '@vanderbilt.edu',
      crypt('placeholder', gen_salt('bf')),
      now(), now(), now(), '{}', '{}'
    )
    returning id
  `);
  const id = rows[0].id;

  await db.query(`insert into public.profiles (id, display_name) values ($1, $2)`, [
    id,
    options.displayName ?? null,
  ]);

  return id;
}

/**
 * Makes `auth.uid()` return `userId`, and RLS policies written `to
 * authenticated` apply, for every later query on this connection.
 */
export async function signInAs(db: Client, userId: string): Promise<void> {
  await db.query("set role authenticated");
  await db.query(
    `select set_config(
       'request.jwt.claims',
       json_build_object('sub', $1::text, 'role', 'authenticated')::text,
       false
     )`,
    [userId],
  );
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
}
