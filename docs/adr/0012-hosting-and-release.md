# ADR 0012 — Hosting and release: stay on Vercel, containerize alongside it

**Status:** Accepted · **Date:** 2026-11-17
**Comes from:** Sprint 5 planning (D8, #161). Implemented by V1–V4 and V9
(#147–#150, #155). The diagram is in [`docs/deployment.md`](../deployment.md).

## Context

Sprint 5 asks for a real release path:

- a container image built on every pull request;
- a **staging** environment, deployed automatically on every merge to main;
- smoke tests against staging after every deploy;
- a **production** environment, promoted only after staging is green and a
  teammate approves;
- a rollback that we have actually practised.

Today the app is one Next.js project on Vercel, deployed by Vercel's Git
integration on every push. It talks to one hosted Supabase project
(production). There is no staging database: `deploy-db.yml`'s staging job is
a no-op until W10 (#54), and SEC-08 was closed by keeping production's keys
out of Vercel's Preview environment.

The brief prefers one image built once and deployed to both environments. It
also allows a host that cannot run containers: "containerize the parts that
can run in a container, and explain the split in your hosting ADR". This ADR
is that explanation.

## Decision

**We stay on Vercel for the app and Supabase for the data. We build and
publish a Docker image of the app, but Vercel deploys the app from the same
commit, not from the image.**

| | Staging | Production |
| --- | --- | --- |
| App | Vercel, Preview target, aliased to a fixed staging URL | Vercel, Production target |
| Database | A **new**, second free Supabase project with seed data | Today's Supabase project. No seed or test accounts except the grader accounts in the README |
| Deployed when | A green CI run for a push to main | A `v*` tag on a commit from main, after that commit's staging smoke run is green |
| Gate | The smoke tests (V4) run after the deploy | The `production` GitHub Environment: a teammate other than the person who started the deploy must approve |
| Migrations | `deploy-db.yml` (existing), staging job | `deploy-db.yml`'s production job, moved behind the same approval |
| Settings and secrets | Vercel's Preview environment and the GitHub `staging` environment | Vercel's Production environment and the GitHub `production` environment |

How it works:

- **Only GitHub Actions deploys.** We turn off Vercel's Git auto-deploy in
  `vercel.json`. Every deploy runs `vercel deploy` from a workflow on main or
  on a tag, so nobody deploys from a laptop and no unreviewed branch gets a
  preview. That also closes the original cause of SEC-08.
- **The image.** CI builds it from a multi-stage `Dockerfile` (Next.js
  standalone output, non-root, no dev dependencies) on every pull request. A
  broken Dockerfile fails the check. On merge to main, CI pushes the image to
  GitHub Container Registry, tagged with the commit SHA. `docker-compose.yml`
  runs that image with a local Supabase stack, so "clone, copy `.env.example`,
  `docker compose up`" works without Vercel.
- **Promotion means the same commit, rebuilt once for production.**
  `NEXT_PUBLIC_*` values, such as the Supabase URL and the anon key,
  are written into the browser bundle at build time, and staging and
  production use different values. A staging build therefore cannot be
  served as production. The production deploy builds the exact commit that
  passed on staging, from the same lockfile, with production's settings. The
  release notes record the commit SHA for both deployments, and
  `/api/health` (V5) reports it so anyone can check.
- **Rollback** is Vercel's Instant Rollback (`vercel rollback`, or the
  dashboard). It puts the previous production deployment back without a
  rebuild. A migration that already ran is handled with a forward fix
  (`docs/ops/RUNBOOK.md`, D9). Our migrations are additive, as `deploy-db.yml`
  already requires.
- **Monitoring** is Vercel's log view, Sentry's free tier and an external
  uptime check on production's `/api/health` (V6, V7).

## Options considered

| Option | Runs our image? | Cost | Why not chosen |
| --- | --- | --- | --- |
| **Vercel + Supabase (chosen)** | No | $0 (Hobby, Supabase free × 2, GHCR free for a public repo) | Chosen: no move, no cold-start sleep, one-step rollback, preview and log tooling we already use |
| Render (two web services from the GHCR image) + Supabase | Yes | $0 | Free services sleep after about 15 minutes idle (a cold start of tens of seconds), and moving hosts costs about a week of setup before Thanksgiving. It still has the `NEXT_PUBLIC_*` problem unless we load settings at runtime |
| Fly.io + Supabase | Yes | Card required; small monthly cost | No free tier for new accounts |
| Railway + Supabase | Yes | Trial credit only | Runs out before the course does |
| Supabase preview branches (one database per PR) instead of a staging project | — | Paid add-on | We need one stable staging environment for the smoke tests, not one database per branch |

## Consequences

**Good**

- Nothing about production changes for students, and there is no migration
  weekend.
- Rollback is a single, well-tested Vercel feature, so the drill (V8) tests our
  runbook rather than our tooling.
- Staging finally gets its own database, which closes W10 (#54) and the root
  cause of SEC-08. Preview builds stop reaching production entirely.

**Bad**

- **Not "build once, deploy many" for the app.** Production is a second build
  of the same commit. A difference between the two builds (for example, a
  dependency resolved differently) is possible in theory. The lockfile and
  `npm ci` make it unlikely, and the smoke tests can be pointed at production
  after a promotion to check.
- **The image is not what runs in production.** It proves the app
  containerizes and gives a one-command local setup, but a Docker-only bug
  would not show up on Vercel, and the reverse is also true.
- **Vercel Hobby limits.** There are no custom environments, so staging is a
  Preview deployment with an alias. On Hobby, Instant Rollback may only go back
  to the previous production deployment, which is all the drill needs. Hobby is for non-commercial use, which a course
  project is.
- **Deployment Protection.** Preview URLs sit behind Vercel's login by
  default. The smoke tests reach staging with Vercel's protection-bypass
  secret, kept as a GitHub Actions secret. We do not turn protection off.

**What to watch**

- **Supabase free projects pause after a week with no traffic.** Staging stays
  awake as long as something merges. Before a demo, open staging, or unpause
  it in the dashboard (`docs/ops/RUNBOOK.md`, "Known failure modes").
- **Data location.** Both Supabase projects and Vercel's functions should sit
  in the same US region, so a request doesn't cross the country twice. The
  staging project is created in production's region.
- **Comments that will become wrong when V3 lands.** Update these in that PR:
  `deploy-db.yml`'s header ("Vercel deploys the app from the same push on its
  own"), SEC-08's row in `docs/security/findings.md`, and W10 in
  `docs/tickets.md`.

## Revisit if

- The grading of "the same image" turns out to need the image itself running
  in production. If so, move the app to Render using the same image, and load
  the `NEXT_PUBLIC_*` values at runtime. Everything above the host (the
  workflows, the smoke tests and the runbook) carries over.
- We outgrow Hobby, either through usage limits or a commercial launch.
