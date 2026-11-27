// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// V9 (#155): CHANGELOG.md and package.json stay in step.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("CHANGELOG.md (V9)", () => {
  const changelog = read("CHANGELOG.md");
  const version = JSON.parse(read("package.json")).version as string;

  it("keeps an Unreleased section, as Keep a Changelog asks", () => {
    expect(changelog).toMatch(/^## \[Unreleased\]$/m);
  });

  it("mentions package.json's version, so /api/health never reports one the changelog does not know", () => {
    expect(changelog).toContain(version);
  });

  it("dates every numbered version", () => {
    const headings = changelog.match(/^## \[(?!Unreleased).*$/gm) ?? [];
    expect(headings.length).toBeGreaterThan(0);
    for (const heading of headings) {
      expect(heading).toMatch(/^## \[\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?\] - \d{4}-\d{2}-\d{2}$/);
    }
  });
});
