// Before the journeys: give the stub picker's fixture places real `locations`
// rows in the LOCAL database, so a session can be created end to end before
// M2's Google picker exists. This is M5's (#36) local-and-CI option; nothing
// here can reach the hosted project (playwright.config.ts and
// tests/db/connection.ts both refuse non-local hosts).

import { FIXTURE_LOCATIONS } from "../../src/lib/fixtures";
import { connect } from "../db/connection";

export default async function globalSetup(): Promise<void> {
  const db = await connect();
  try {
    for (const location of FIXTURE_LOCATIONS) {
      await db.query(
        `insert into public.locations (id, place_id, lat, lng, validated_at)
         values ($1, $2, $3, $4, now())
         on conflict (id) do nothing`,
        [location.id, location.place_id, location.lat, location.lng],
      );
    }
  } finally {
    await db.end();
  }
}
