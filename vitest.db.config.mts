import { defineConfig } from "vitest/config";

// Database tests: run against the local Supabase database, never the hosted
// one (tests/db/connection.ts enforces that). Kept out of `npm test` so unit
// tests stay fast and need no Docker. Run with `npm run test:db`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    // One database, shared state: run files one at a time.
    fileParallelism: false,
  },
});
