// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SMOKE_CONTEXT, releaseGateProblems } from "../../scripts/release-gate.mjs";

// V3 (#149): the release pipeline in .github/workflows/deploy.yml. The gate's
// decision is a pure function, tested here for every refusal; the workflow
// settings it depends on are checked as text, as auth-settings.test.ts does.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const good = {
  tag: "v1.0.0-rc1",
  onMain: true,
  smokeState: "success",
  packageVersion: "1.0.0-rc1",
};

describe("the production gate (scripts/release-gate.mjs)", () => {
  it("lets a tag from main with a green staging smoke run through", () => {
    expect(releaseGateProblems(good)).toEqual([]);
    expect(releaseGateProblems({ ...good, tag: "v1.0.0", packageVersion: "1.0.0" })).toEqual([]);
  });

  it("refuses a commit whose smoke tests failed on staging", () => {
    const problems = releaseGateProblems({ ...good, smokeState: "failure" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('"failure", not success');
  });

  it("refuses a commit that never reached staging, or is still being tested", () => {
    expect(releaseGateProblems({ ...good, smokeState: "missing" })[0]).toContain(
      "never deployed to staging",
    );
    expect(releaseGateProblems({ ...good, smokeState: undefined })[0]).toContain(
      "never deployed to staging",
    );
    expect(releaseGateProblems({ ...good, smokeState: "pending" })).toHaveLength(1);
  });

  it("refuses a tag on a commit that is not on main", () => {
    expect(releaseGateProblems({ ...good, onMain: false })).toEqual([
      "The tagged commit is not on main. Tag a commit that has merged.",
    ]);
  });

  it("refuses a tag that disagrees with package.json, which /api/health reports", () => {
    expect(releaseGateProblems({ ...good, packageVersion: "0.1.0" })[0]).toContain(
      "package.json says 0.1.0",
    );
  });

  it("refuses something that is not a version tag", () => {
    expect(releaseGateProblems({ ...good, tag: "vNext" })[0]).toContain("not a release tag");
    expect(releaseGateProblems({ ...good, tag: undefined })[0]).toContain("not a release tag");
  });

  it("reports every problem at once, not only the first", () => {
    expect(
      releaseGateProblems({ tag: "v2.0.0", onMain: false, smokeState: "failure", packageVersion: "1.0.0" }),
    ).toHaveLength(3);
  });
});

describe("deploy.yml and vercel.json", () => {
  const deploy = read(".github/workflows/deploy.yml");

  it("turns off Vercel's own Git deploys, so only Actions deploys", () => {
    expect(JSON.parse(read("vercel.json")).git.deploymentEnabled).toBe(false);
  });

  it("records and reads the same commit status the gate checks", () => {
    expect(deploy).toContain(`-f context="${SMOKE_CONTEXT}"`);
    expect(deploy).toContain(`select(.context == "${SMOKE_CONTEXT}")`);
  });

  it("deploys to production only after the gate, in the approved environment", () => {
    const production = deploy.slice(deploy.indexOf("\n  production:"));
    expect(production).toContain("needs: release-gate");
    expect(production).toMatch(/environment:\n\s+name: production/);
    expect(production).toContain("deploy --prebuilt --prod");
    // The gate runs only for v* tags.
    expect(deploy).toContain("startsWith(github.ref, 'refs/tags/v')");
  });

  it("never deploys to production from the staging job", () => {
    const staging = deploy.slice(deploy.indexOf("\n  staging:"), deploy.indexOf("\n  smoke:"));
    expect(staging).toContain("--environment=preview");
    expect(staging).not.toContain("--prod");
  });
});
