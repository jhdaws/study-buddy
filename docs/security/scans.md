# Security scans -- Study Buddy   (docs/security/scans.md)

Last run: 2026-11-08, on branch `claude/focused-davinci-up2a1t` (from main @ `3e89506`).
In CI these scans are the `security` job in `.github/workflows/ci.yml`. It runs on every pull
request and every push to main, beside `verify`. Finding IDs (`SEC-nn`, `Tn`) come from
`docs/security/threat-model.md` (#86).

Triage labels: **TP** true positive · **FP** false positive (with a reason) · **AR** accepted
risk (with a reason and an owner). **No suppressions exist.** Nothing adds a `nosemgrep`
comment, a `.semgrepignore`, a `.gitleaksignore` or a gitleaks config. If you add one later,
give it a comment saying why, and add a row here.

## 1. Tools and commands

| Tool | Version | Command, as CI runs it | Fails the job on | Scope |
| --- | --- | --- | --- | --- |
| npm audit | npm 10.9, bundled with Node 22 (local run: Node 22.23.4, npm 10.9.9) | `npm audit --omit=dev --audit-level=high` | any High or Critical advisory | the production tree of `package-lock.json`. It needs no install. |
| Semgrep CE | 1.184.0 (`pipx install semgrep==1.184.0`) | `semgrep scan --metrics=off --config p/javascript --config p/typescript --config p/react --config p/nextjs --json-output=…`, then `jq` counts the results with `extra.severity == "ERROR"` | any ERROR finding. WARNING and INFO findings are printed but do not fail the job. | the 97 JS/TS files git tracks. Semgrep's default ignore skips `tests/` (13 files); the colocated `src/**/*.test.ts` files are scanned. |
| gitleaks | 8.30.1 (release tarball, SHA-256 checked) | `gitleaks git --redact --verbose --exit-code 1 .`, after `actions/checkout` with `fetch-depth: 0` | any finding | every commit on every branch and tag. The local run covered 95 non-merge commits on 36 branches and the tag `sprint3`. Merge commits carry no patch, so there is nothing in them to scan. |

I also checked that each gate fails when it should:
- `npm audit` exits 1 on main's lockfile.
- The Semgrep gate exits 1 on a probe file with an ERROR finding (`react-insecure-request`).
  It exits 0 on a probe whose only finding is a WARNING (`react-dangerouslysetinnerhtml`).
- The gitleaks step exits 1 on a commit containing a randomly generated `ghp_` token
  (rule `github-pat`). The log shows the value as `REDACTED`.

All probes ran in scratch repositories, outside this repo.

## 2. Counts by severity

| Scan | Critical | High | Moderate | Low | Result |
| --- | --- | --- | --- | --- | --- |
| npm audit, main @ `3e89506` | 1 | 2 | 0 | 0 | **fails** |
| npm audit, this branch | 0 | 0 | 0 | 0 | passes |

npm counts one row per package. The critical row is `next` (three advisories: two critical, one
high). The two high rows are `sharp` and `source-map-js`.

| Scan | ERROR | WARNING | INFO | Result |
| --- | --- | --- | --- | --- |
| Semgrep, 74 rules | 0 | 0 | 0 | passes |

| Scan | Findings | Result |
| --- | --- | --- |
| gitleaks, full history | 0 | passes |

## 3. Triage

### npm audit: every advisory in the production tree on main (SEC-06, T9)

Every advisory is a **TP**: the installed version was in the vulnerable range. The
"Reachable?" column says whether our code actually uses the vulnerable feature. All five are
fixed in this PR, so none is accepted.

| # | Package | Advisory | Severity | Reachable in Study Buddy? | Fixed by |
| --- | --- | --- | --- | --- | --- |
| A1 | next 16.4.0 | [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw): RCE in the Image Optimization API when SVG files are used. The cause is the upstream library behind image optimization, on glibc Linux. | critical | **Unclear, so treated as exposed.** No code uses `next/image`, and `next.config.ts` sets no `images` options. But Next.js serves the `/_next/image` route by default, and `public/` holds SVGs. Not tested. | next 16.4.5 |
| A2 | next 16.4.0 | [GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r): DoS through crafted requests to an App Router app with at least one Server Action | high | **Yes.** `src/app/login/actions.ts` and `src/app/sessions/actions.ts` are Server Actions on the App Router, and production ran 16.4.0. | next 16.4.5 |
| A3 | next 16.4.0 | [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr): RCE in `use cache` functions that return typed arrays | critical | **No.** There is no `"use cache"` anywhere, and `cacheComponents` is not set. The advisory says to upgrade anyway. | next 16.4.5 |
| A4 | sharp 0.35.4, an optional dependency of next | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): a librsvg flaw reached through SVG decoding | high | Only through image optimization, so the same answer as A1: unclear, treated as exposed. | sharp 0.35.5 (next 16.4.5 requires `^0.35.5`) |
| A5 | source-map-js 1.2.1, used by postcss and Tailwind | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): event-loop DoS through crafted indexed source maps | high | **No.** No user-supplied source map reaches it. It runs at build time on our own CSS, and under jsdom in tests. | source-map-js 1.2.2 (`npm update source-map-js`) |

**Version note.** All three Next.js advisories name **16.4.1** as the first patched version,
and npm's range (`16.0.0 - 16.4.0`) agrees. None of them explains the ≥ 16.4.4 target in T9.
From 16.4.1 onward, next already requires the fixed sharp. This PR pins 16.4.5, the latest
patch, which meets both bars. If the 16.4.4 target has another source, record it here.

### Semgrep

There were no findings, so there is nothing to triage as TP or FP. The clean result has two
limits:

- **The rule set is thin. This is an AR (owner: Jack, A03).** Without a Semgrep account, the
  registry serves:
  - `p/javascript` and `p/typescript`: the same 74 rules (24 ERROR, 50 WARNING).
  - `p/react`: 4 rules, all of them already among those 74.
  - `p/nextjs`: **0 rules** (the registry returns `rules: []`).

  40 of the 74 rules target Express or AWS Lambda, which we do not use. So nothing
  Next.js-specific is checked. A Semgrep account token (a `SEMGREP_APP_TOKEN` secret) would
  unlock the registry rules that need a login; that is a team decision. Until then, the manual
  OWASP review (threat model §4, A01 and A05) covers Next.js patterns. If the registry starts
  serving `p/nextjs` rules to everyone, the job picks them up automatically.
- **One file was only partly parsed.** At `src/app/sessions/actions.test.ts:38` the parser
  cannot handle a generic call (`>()`). The rest of that file was scanned, and about 99.9% of
  lines overall. This is a tool warning, not a finding, so no action is needed.

### gitleaks

There were no findings, so there is no `.gitleaksignore`.

**SEC-01 (T1): gitleaks does not catch the demo password.** The old demo password for
`njpm@vanderbilt.edu` is a six-digit number. It appears at `HANDOFF.md` lines 354, 382 and 393
and at `docs/ai-usage-log.md` line 74, and was first committed in `5bc3851`.

- The only gitleaks rule that could match a password, `generic-api-key`, needs a value of at
  least 10 characters with Shannon entropy of at least 3.5. Six digits have at most
  log2(6) ≈ 2.58.
- I tested the exact lines, plus the forms `DEMO_PASSWORD=<value>` and `password: "<value>"`.
  Each gave 0 findings.

This is a **false negative by design**, not a mistake in our config. A custom rule for short
numbers would also flag the sign-in code fixtures in `src/app/login/actions.test.ts` and
`src/components/SignInForm.test.tsx`, which use the same value. So gitleaks is no control for
SEC-01, and **SEC-01 stays open.** Owner: Moses (A04). The fix is to check Supabase Auth →
Users and confirm the hosted user is deleted, or its password changed. Removing the text would
not help: it stays in the history of a public repo.

## 4. Outside the gate

After this change, `npm audit` over the whole tree, dev dependencies included, reports
0 critical, 2 high and 11 moderate. All of them are in dev-only packages:

- **High:** undici 8.11.2 (through jsdom) and vite 8.3.0 (through vitest and
  `@vitejs/plugin-react`). These are test tools that run on laptops and in CI. They are never
  deployed and never given untrusted input.
- **Moderate:** vitest and `@vitest/mocker`, and minimatch under typescript-eslint (through
  eslint-config-next).

**AR (owner: Jack, A03).** These are outside SEC-06's scope. They are left for Dependabot or a
follow-up PR. npm's suggested fix for the eslint chain is a *downgrade* of eslint-config-next
to 15.5.29. Do not take it.

## 5. Running the scans locally

```bash
npm audit --omit=dev --audit-level=high
```

```bash
pipx install semgrep==1.184.0
```

```bash
semgrep scan --metrics=off --config p/javascript --config p/typescript --config p/react --config p/nextjs
```

```bash
gitleaks git --redact --verbose .
```

For gitleaks, use version 8.30.1 from its GitHub releases. Run `git fetch --all` first so every
branch is scanned.
