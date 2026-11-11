// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Settings that security depends on but that live outside the app's code,
// checked as text so a change to them fails a test (Sprint 4 findings).
// Hosted Supabase has its own copies of the auth settings; supabase/README.md
// says to keep them the same, and ADR 0009 proposes checking that in CI.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("SEC-12: sign-in codes expire after 10 minutes", () => {
  const config = read("supabase/config.toml");

  it("sets otp_expiry to 600 seconds, not Supabase's one-hour default", () => {
    // Wrong guesses never use up a code, so its lifetime is the whole
    // guessing window. Fails with the old `otp_expiry = 3600`.
    expect(config).toMatch(/^otp_expiry = 600$/m);
    expect(config).not.toMatch(/^otp_expiry = 3600$/m);
  });

  it("tells students the same thing in the email", () => {
    expect(read("supabase/templates/magic_link.html")).toContain("expires in 10 minutes");
  });
});

describe("SEC-13: the database deploys only from main", () => {
  const workflow = read(".github/workflows/deploy-db.yml");

  it("refuses a hand-started run from any branch but main", () => {
    // workflow_dispatch offers every branch; without this guard a run from a
    // feature branch would push its migrations to production unreviewed.
    expect(workflow).toContain(
      "(github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main')",
    );
    expect(workflow).not.toMatch(/github\.event_name == 'workflow_dispatch' \|\|/);
  });

  it("deploys after CI only for a push to main", () => {
    expect(workflow).toContain("github.event.workflow_run.event == 'push'");
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'");
  });
});
