// Connections to the LOCAL Supabase database, for tests that need real
// Postgres behaviour: locks, constraints, RLS. Start it with `npm run db:start`.
//
// Each call returns an independent connection. That is the point: concurrency
// tests like US-07b need two sessions that can block each other, which a single
// pooled client cannot do.

import { Client } from "pg";

// The Supabase CLI's fixed local credentials -- not a secret.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? LOCAL_DB_URL;

// These tests create, lock, and delete rows. Refuse anything that is not on
// this machine, so a stray environment variable can never point them at the
// hosted project.
const host = new URL(DATABASE_URL).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(
    `Database tests only run against a local database; refusing host "${host}".`,
  );
}

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      "Could not reach the local database. Is it running? Try `npm run db:start` " +
        "(needs Docker).",
      { cause: error },
    );
  }
  return client;
}
