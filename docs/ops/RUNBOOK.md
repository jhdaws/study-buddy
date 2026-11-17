# Runbook — Study Buddy

Sprint 5 (release sprint), Appendix B's template. Owner: Tapan.

**Status: draft, written before the release pipeline exists.** Checkpoint 1
(Fri 11/20) only requires the Sprint 5 board, the deployment diagram, the
hosting ADR draft, and the Dockerfile — none of the staging/production split,
the smoke tests, or monitoring exist yet (Jack's and Nate's tasks, due by
Checkpoint 2, Tue 12/1). Everything below marked **(planned)** describes the
process the team agreed to in the Sprint 5 planning meeting (11/17); it is
not yet true of the running system. The sections marked **(today)** describe
what is actually true right now, so this doc stays honest about the
difference rather than reading like a finished pipeline that doesn't exist.
Update the **(planned)** sections to drop that tag, with real URLs and
screenshots, as each piece lands — starting with Jack's hosting ADR and
deployment diagram, which this doc should match exactly once written.

## System overview

- **App:** Next.js 16, one deployable (Server Actions and Route Handlers;
  see `docs/architecture.md` for why there is no separate backend service).
- **Hosting (today):** Vercel, one project, auto-deploying every push to
  `main` to `study-buddy-jdaws.vercel.app`. The team confirmed staying on
  Vercel rather than moving to Render (11/17) — Vercel already gave up a
  second deployable in Sprint 1's own architecture decision
  (`docs/architecture.md`), and the Sprint 5 release path does not need a
  second host to get a real staging/production split.
- **Hosting (planned):** two environments on Vercel per the hosting ADR
  (Jack) — the exact mechanism (two Vercel projects, or one project's
  `vercel promote` to move a single built deployment from staging to
  production without a rebuild) is Jack's decision to pin down there. This
  runbook assumes "build once, deploy many" either way: whichever mechanism,
  the image/build that reaches production is the one that already passed on
  staging, never a second build.
- **Database:** Supabase (hosted). Today there is one hosted project. The
  Sprint 5 plan calls for two — a staging project with seed/demo data, and a
  production project with no test or seed accounts beyond the ones listed
  for graders.
- **Registry (planned):** GitHub Container Registry, once Nate's Dockerfile
  and CI build step land (Checkpoint 1).
- **CI:** GitHub Actions, `.github/workflows/ci.yml` — `verify` (lint,
  typecheck, unit tests + coverage gate, build), `db` (real Postgres), `e2e`
  (Playwright against a full local stack), `security` (dependency audit,
  Semgrep, gitleaks), `coverage-report`. A Sprint 5 image-build job, and the
  staging deploy + smoke test jobs this runbook describes, are additions to
  this same file.
- **Who has access:** the hosted Supabase project and the Vercel project are
  both under Jack's accounts (`jhdaws`). Ask Jack for staging/production
  access rather than this runbook naming anything beyond that.

## Deploy to staging (planned)

1. A pull request merges to `main`.
2. CI's existing `verify`/`db`/`e2e`/`security` jobs run as they do today,
   plus the new image-build step (Nate, Checkpoint 1): the Dockerfile builds,
   and on success the image is pushed to GHCR tagged with the commit SHA.
3. The staging deploy triggers automatically from that same push — the exact
   trigger (a Vercel Git integration on a dedicated branch, or a GitHub
   Actions step that calls the Vercel CLI/API) is Jack's hosting setup.
4. The three smoke tests (Tapan, this sprint) run against the staging URL
   once the deploy finishes. A failing smoke test marks the deploy failed and
   blocks the next step — it does not roll anything back by itself, since
   nothing has reached production yet.
5. **Where to watch it:** the GitHub Actions run for the merge commit, and
   the Vercel dashboard's deployment list for the staging project/branch.
6. **How long it takes:** not yet measured — record a real figure here once
   Checkpoint 2's pipeline is live.

## Promote to production (planned)

1. Only a build that is already green on staging is eligible — never a
   rebuild, and never a deploy triggered from a laptop (Sprint 3/4 rules
   still apply: `main` is protected, every change is a reviewed pull
   request).
2. Promotion is triggered either by pushing a `v*` release tag, or by a
   manual GitHub Actions workflow run — whichever the hosting ADR settles
   on. Either way it requires the approval step (a GitHub Environment with a
   required reviewer, or an equivalent check) the Sprint 5 brief asks for.
3. **Who approves:** a teammate other than whoever triggered the promotion —
   the same "not your own pull request" rule, applied to releases.
4. **What to check afterward:** the production URL loads, the health
   endpoint reports the expected version and commit SHA, and the feature the
   release was for actually works signed in on production (not just
   staging) — the grader-facing test accounts exist for exactly this.

## Roll back (planned)

1. **If the bad release is only a deploy, no migration:** put the previous
   image back in production. On Vercel this is "Promote to Production" on
   the prior deployment (or the CLI's `vercel rollback`) — no rebuild, the
   same artifact that was live before. Record the time from the problem
   being noticed to the previous version being live again: that is the
   number the rollback drill reports.
2. **If a database migration already ran:** the image alone cannot be rolled
   back without also deciding what happens to the schema. Prefer a **forward
   fix** (a new migration that corrects the problem) over a down-migration
   whenever the bad migration already has committed rows depending on it —
   this project's migrations are already written "never edit one that has
   applied; add a new one" for exactly this reason (`CLAUDE.md`). Only write
   a down-migration when the bad migration's change is trivially reversible
   (an added column with no data in it yet, say).
3. **After rolling back:** confirm the health endpoint and the smoke tests
   both pass against production again before calling it resolved.

## Where to look

- **Logs (planned):** structured (JSON or `key=value`), with a request id
  and a level — Moses's task this sprint. Until that lands, Vercel's own
  function logs (dashboard → the deployment → Logs) are what exist today.
- **Errors/uptime (planned):** Sentry (captured exceptions) or an external
  uptime check against `/health` with an alert to the team channel — Moses's
  task. Neither exists yet.
- **CI:** the Actions tab on the repository; each job's logs are the first
  place a broken pipeline shows why.
- **The database:** Supabase's dashboard (Jack's account for the hosted
  project) — table editor, SQL editor, and Auth → Users for anything
  account-related.

## Known failure modes

- **Free-tier cold starts.** Vercel's hobby tier and Supabase's free tier
  can both sleep or cold-start when idle. Wake the production URL and sign
  in once before any live demo or presentation — the Sprint 4 report already
  notes this same risk for the Google Maps key setup, and it applies again
  here.
- **Expired or missing secrets.** Every setting comes from an environment
  variable, never a hard-coded value (Sprint 5 Appendix A). If a deploy
  succeeds but the app errors on every page, check the environment's secrets
  before anything else — `next.config.ts` already fails a *production*
  Vercel build outright if the two Google Maps keys are set inconsistently
  (BUG-19); a similar fail-fast check is worth adding for any new Sprint 5
  secret (a Resend/email API key, if US-10 needs one).
- **A migration that fails partway through production.** Stop there — do
  not retry blindly. Check the migration's SQL for anything non-idempotent,
  fix forward with a new migration once the cause is understood, and see
  "Roll back" above for what happens to the image in the meantime.
- **Staging and production pointed at the same database by mistake.** This
  bit the team once already, pre-Sprint-5 (SEC-08: Vercel previews ran
  against the production Supabase project). Whoever sets up the two
  Supabase projects this sprint should re-check this specifically, not
  assume the SEC-08 fix for previews also covers a new staging environment.

## Rollback drill

**Not yet performed.** The Sprint 5 brief requires doing this for real —
releasing a deliberately harmless bad version to production, detecting it,
and rolling back by following the steps above — before 12/8, and recording
the actual time from detection to recovery. That needs production to exist
first (Checkpoint 3, 12/6). Record of the real drill, once run:

- **What was broken:**
- **How it was detected** (smoke test failure / monitoring alert):
- **Steps followed:**
- **Time from detection to recovery:**
- **What, if anything, this runbook should have said and didn't:**
