// Gives the stub <LocationPicker>'s fixture places real `locations` rows in
// the LOCAL database, so a session can be created end to end -- in `next dev`,
// not just in Playwright -- before M2's Google picker exists. M5 (#36).
//
// Without this, resolvePlace() still returns a `locationId` for a fixture
// place id (src/lib/places.ts's FIXTURE_ID_PREFIX shortcut), but that id is
// not a real row, so create_session's foreign key on `location_id` fails and
// the student sees "Something went wrong saving that".
//
// Deliberately NOT part of supabase/seed.sql: that file is what
// `supabase db push --include-seed` sends to a hosted project (see
// supabase/README.md, "A staging database for previews"). Keeping these rows
// out of it, and out of every migration, means no hosted push can ever carry
// them -- the guard below is a second line of defence, not the only one.
//
// tests/e2e/global-setup.ts does the same thing for Playwright, independently
// (a different process, before the dev server exists). Keep both in sync if
// FIXTURE_LOCATIONS changes shape.
//
//   node scripts/seed-local-locations.ts
//
// Run automatically by `npm run db:start` and `npm run db:reset`. Safe to
// run again: `on conflict (id) do nothing`.

import { Client } from "pg";

import { FIXTURE_LOCATIONS } from "../src/lib/fixtures.ts";

// The Supabase CLI's fixed local credentials -- not a secret.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? LOCAL_DB_URL;

// This writes rows. Refuse anything that is not on this machine, so a stray
// environment variable can never point it at a hosted project.
const host = new URL(DATABASE_URL).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(
    `seed-local-locations only runs against a local database; refusing host "${host}".`,
  );
}

const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();
  for (const location of FIXTURE_LOCATIONS) {
    await client.query(
      `insert into public.locations (id, place_id, lat, lng, validated_at)
       values ($1, $2, $3, $4, now())
       on conflict (id) do nothing`,
      [location.id, location.place_id, location.lat, location.lng],
    );
  }
  console.log(`seed-local-locations: ${FIXTURE_LOCATIONS.length} fixture location(s) ready.`);
} catch (error) {
  console.error(
    "seed-local-locations: could not reach the local database. Is it running? " +
      "Try `npm run db:start` (needs Docker).",
  );
  throw error;
} finally {
  await client.end();
}
