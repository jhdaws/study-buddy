# Release checklist: v1.0.0-rc1 and v1.0.0

The two Sprint 5 releases (V9, #155), step by step. How the pipeline works is
in [`RUNBOOK.md`](./RUNBOOK.md); this is only the order of things.
`package.json` already says `1.0.0-rc1`.

## v1.0.0-rc1: feature freeze, Sun 12/6

A pre-release tag goes through the release gate and stops there: it marks
the freeze commit as checked on staging and deploys nothing to production.

**1. Everything for the freeze has merged.** Check each on GitHub:

| Ticket | Issue | PR |
| --- | --- | --- |
| V3 staging and production | #149 | #177 |
| V4 smoke tests | #150 | *(none yet)* |
| V5 `/api/health` | #151 | *(none yet)* |
| V6 structured logs | #152 | *(none yet)* |
| V7 Sentry and uptime check | #153 | *(none yet)* |
| P5 US-18 report a chat message | #156 | *(none yet)* |
| S11 US-13 remove an attendee | #157 | *(none yet)* |
| N2 US-10 reminder | #158 | *(none yet)* |
| D9 runbook | #162 | #178 |
| V9 CHANGELOG | #155 | this one |
| BUG-24 to BUG-26 (compose and image) | *(to open, Nate)* | *(none yet)* |

**2. Close the changelog in a pull request.** In `CHANGELOG.md`, rename
`[Unreleased]` to `[1.0.0-rc1] - 2026-12-06`, list what merged since this
file was written, add an empty `[Unreleased]` above it, and fix the links at
the bottom. Merge it.

**3. Wait for that commit's staging run.** Actions → Deploy → the run for the
merge commit. It must end with a green **staging smoke** status.

**4. Tag it** (any teammate; the commit is the one from step 3):

```bash
git fetch origin
git tag -a v1.0.0-rc1 -m "v1.0.0-rc1: feature freeze" <merge-commit-sha>
git push origin v1.0.0-rc1
```

Actions → Deploy → the tag's run: `release-gate` green, `production`
skipped. That run is the checkpoint's evidence.

## v1.0.0: production, Tue 12/8

1. A pull request that sets `"version": "1.0.0"` (`npm version 1.0.0
   --no-git-tag-version`, which also updates `package-lock.json`) and
   renames the changelog's top section to `[1.0.0] - 2026-12-08`. Only
   fixes found on staging since rc1 go in between; no new features.
2. Merge, wait for the green **staging smoke** status on the merge commit.
3. `git tag -a v1.0.0 -m "v1.0.0" <merge-commit-sha>` and
   `git push origin v1.0.0`.
4. A teammate other than the tagger approves the `production` deploy
   (screenshot the approval for the report).
5. Check production (RUNBOOK, "Promote to production", "Check
   afterwards"), then publish the GitHub Release from the drafted notes.

The rollback drill (V8) comes after this, as `v1.0.1`.
