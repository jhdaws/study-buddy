// End-to-end tests (W8, #37): the main journeys, in a real browser, against a
// production build of the app and the LOCAL Supabase stack.
//
//   npm run db:start     # once; needs Docker (auth, API and Mailpit too)
//   npm run test:e2e
//
// The app's Supabase settings come from `supabase status`, so the tests can
// never point at the hosted project: they create real users, and they refuse
// any API or database that is not on this machine. Sign-in codes are read
// from the local Mailpit inbox. CI runs the same command (ci.yml, `e2e`).

import { execSync } from "node:child_process";

import { defineConfig } from "@playwright/test";

const PORT = 3100;

/** Fill in the local stack's URL, key, database and Mailpit from `supabase status`. */
function pointAtLocalSupabase(): void {
  const status = Object.fromEntries(
    execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((line) => /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim()))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]]),
  );

  const apiUrl = status.API_URL;
  const mailpitUrl = status.MAILPIT_URL ?? status.INBUCKET_URL;
  if (!apiUrl || !status.ANON_KEY || !status.DB_URL || !mailpitUrl) {
    throw new Error("No local Supabase found. Run `npm run db:start` first (needs Docker).");
  }
  for (const url of [apiUrl, status.DB_URL, mailpitUrl]) {
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error(`End-to-end tests only run against a local stack; refusing host "${host}".`);
    }
  }

  // process.env wins over .env.local in `next build`, so a developer whose
  // .env.local points at the hosted project still tests against local.
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.TEST_DATABASE_URL = status.DB_URL;
  process.env.MAILPIT_URL = mailpitUrl;
  // No Google key: the stub picker's fixture places resolve without Google
  // (src/lib/places.ts), and global-setup.ts gives them location rows.
  delete process.env.GOOGLE_MAPS_SERVER_API_KEY;
}

pointAtLocalSupabase();

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One database, shared state: journeys run one at a time.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: "chromium",
    // Mobile first (ADR 0004): the journeys run at phone width.
    viewport: { width: 375, height: 812 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
