// The checks a v* tag must pass before deploy.yml asks for the production
// approval (V3, #149; ADR 0012). The workflow gathers the facts with git and
// the GitHub API and passes them in as environment variables; the decision
// is here, as a pure function, so src/lib/release-pipeline.test.ts can test
// every refusal without a real tag.
//
//   RELEASE_TAG      the tag name, e.g. v1.0.0-rc1
//   ON_MAIN          "true" if the tagged commit is on origin/main
//   SMOKE_STATE      the commit status SMOKE_CONTEXT has for that commit:
//                    success | failure | error | pending | missing
//   PACKAGE_VERSION  "version" from package.json at that commit
//
// Exits 1 with one ::error:: line per problem, so the run's summary says why.

import { pathToFileURL } from "node:url";

/** The commit status deploy.yml's staging run sets once the smoke tests finish. */
export const SMOKE_CONTEXT = "staging smoke";

/**
 * @param {{ tag?: string, onMain?: boolean, smokeState?: string, packageVersion?: string }} facts
 * @returns {string[]} the reasons to refuse; empty means the tag may go to production
 */
export function releaseGateProblems({ tag, onMain, smokeState, packageVersion }) {
  const problems = [];

  if (!tag || !/^v\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(tag)) {
    problems.push(`"${tag ?? ""}" is not a release tag like v1.0.0 or v1.0.0-rc1.`);
  } else if (packageVersion !== tag.slice(1)) {
    // /api/health reports package.json's version (V5), so a tag that
    // disagrees with it would make production lie about what it runs.
    problems.push(
      `The tag says ${tag.slice(1)} but package.json says ${packageVersion ?? "nothing"}. Bump the version on main first.`,
    );
  }

  if (!onMain) {
    // A tag can point anywhere, including a branch nobody reviewed (SEC-13).
    problems.push("The tagged commit is not on main. Tag a commit that has merged.");
  }

  if (smokeState !== "success") {
    problems.push(
      smokeState === "missing" || !smokeState
        ? `This commit has no "${SMOKE_CONTEXT}" result: it was never deployed to staging. Wait for its staging deploy, or tag a commit that has one.`
        : `This commit's "${SMOKE_CONTEXT}" result is "${smokeState}", not success. Fix staging first.`,
    );
  }

  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const problems = releaseGateProblems({
    tag: process.env.RELEASE_TAG,
    onMain: process.env.ON_MAIN === "true",
    smokeState: process.env.SMOKE_STATE,
    packageVersion: process.env.PACKAGE_VERSION,
  });
  for (const problem of problems) console.log(`::error::${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`${process.env.RELEASE_TAG} may be promoted: on main, staging smoke green.`);
}
