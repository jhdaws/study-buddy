// Entry point for seed-local-locations.mts, kept as plain JS on purpose.
//
// seed-local-locations.mts imports fixtures.ts directly, which only works on
// a Node version new enough to strip TypeScript syntax itself (22.18+,
// unflagged). On an older Node, trying to load a .mts file straight away
// fails with ERR_UNKNOWN_FILE_EXTENSION or similar before a single line of
// it runs -- so the version check has to live here, in a file every Node
// version can at least parse, not in the .mts file itself. Found in review
// of #74 (M5).

const [major, minor] = process.versions.node.split(".").map(Number);
const NODE_TOO_OLD = major < 22 || (major === 22 && minor < 18);

if (NODE_TOO_OLD) {
  console.error(
    `seed-local-locations: Node ${process.versions.node} can't run a .ts file directly ` +
      "(needs 22.18 or later, since this script imports src/lib/fixtures.ts). " +
      "Upgrade Node, or run `npm run db:start` without this step and create a session " +
      "through the real picker once M2 lands.",
  );
  process.exit(1);
}

await import("./seed-local-locations.mts");
