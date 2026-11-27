# Runbook: Study Buddy

How to deploy, promote, roll back and debug Study Buddy (D9, #162; Sprint 5
brief, Appendix B). The reasons behind the setup are in
[ADR 0012](../adr/0012-hosting-and-release.md); the picture is in
[`docs/deployment.md`](../deployment.md). Built on Tapan's first draft
(branch `ops-runbook-rollback-drill`, 2026-11-17), updated for the pipeline
V3 (#149) actually built. The rollback drill (V8, #154) follows this file and
records its result at the end.

> **Before the first real run:** parts of this describe pieces that land with
> other tickets. Each one says so: the smoke tests (V4, #150), `/api/health`
> (V5, #151), structured logs (V6, #152) and Sentry plus the uptime check
> (V7, #153). When one lands, delete its note and fill in what it really
> shows.

## System overview

Names only. No value in this file is a secret, and none should ever be added.

| Piece | Staging | Production |
| --- | --- | --- |
| URL | `https://<STAGING_HOST>` (the `STAGING_HOST` variable of the GitHub `staging` environment), behind Vercel's login | https://study-buddy-jdaws.vercel.app (public) |
| App | Vercel project `study-buddy`, **Preview** target, aliased to the staging URL | the same Vercel project, **Production** target |
| Database | Supabase project `study-buddy-staging`, seed data plus the smoke-test account | Supabase project for production: real users, plus the grader accounts in the README |
| App settings | Vercel → Settings → Environment Variables, **Preview** | the same page, **Production** |
| Deploy settings | GitHub → Settings → Environments → `staging` | `production` (required reviewer, prevent self-review) |
| Deployed by | `.github/workflows/deploy.yml`, after a green CI run on `main` | `deploy.yml`, from a `v*` tag, after approval |
| Image | `ghcr.io/jhdaws/study-buddy:sha-<commit>` (built by CI's `docker` job; for local runs, not served by Vercel) | the same |

The settings, by name:

| Name | Kind | Where | What it is |
| --- | --- | --- | --- |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | variable | repository | which Vercel project to deploy |
| `VERCEL_TOKEN` | secret | `staging`, `production` | lets Actions deploy; **expires** (see "Known failure modes") |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | secret | `staging` | lets the smoke tests past Vercel's login |
| `SUPABASE_ACCESS_TOKEN` | secret | `staging`, `production` | lets Actions apply migrations |
| `SUPABASE_PROJECT_ID` | variable | `staging`, `production` | which Supabase project gets the migrations |
| `STAGING_HOST`, `PRODUCTION_URL` | variable | `staging`, `production` | the fixed URLs |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | app settings | Vercel Preview / Production | `.env.example` explains each |

Who can change what: Jack owns the Vercel project, both Supabase projects and
the repository settings. Any teammate except the person who pushed the tag
can approve a production deploy.

## Deploy to staging

Nothing to do by hand. It happens on every merge to `main`.

1. The pull request merges. CI (`ci.yml`) runs on `main`.
2. When CI is green, **Deploy** (`deploy.yml`) starts on its own:
   `staging` job: migrations to the staging database, then `vercel build` and
   `vercel deploy` with the Preview settings, then the staging URL is pointed
   at the new deployment.
3. `smoke` runs `smoke-tests.yml` against the staging URL. *(Until V4 lands
   this is one request to `/login`.)*
4. `record-smoke` puts a **staging smoke** status (green or red) on the
   commit. You can see it next to the commit on GitHub.

**Where to watch:** Actions → Deploy → the run for that commit. The `staging`
job's summary shows the staging URL and the deployment's own URL.

**Redeploy by hand** (after changing a Vercel setting, say): Actions →
Deploy → Run workflow → branch `main`. Any other branch is refused.

**How long it takes:** *not measured yet; fill in after the first green
run.*

## Promote to production

Production gets a commit only when someone tags it, and only if that commit
already passed on staging.

A **pre-release** tag such as `v1.0.0-rc1` goes through the same gate but
stops there: it marks the freeze commit as checked on staging and deploys
nothing to production. Only a plain version (`v1.0.0`, `v1.0.1`) does.

1. Check the commit you want shows a green **staging smoke** status on
   GitHub (the commit's page, or the ✓ next to it in the commit list).
2. Make sure `package.json`'s `version` already says the version you are
   releasing (for `v1.0.0`, `"version": "1.0.0"`). If not, bump it in a pull
   request, merge it, and wait for that commit's staging run.
3. Tag that commit on your machine and push the tag:

   ```bash
   git fetch origin
   git tag -a v1.0.0 -m "v1.0.0" <commit-sha>   # the commit from step 1
   git push origin v1.0.0
   ```

4. Actions → Deploy → the run for the tag. `release-gate` checks three things
   and says which one failed: the commit is on `main`, its staging smoke
   status is green, and the tag matches `package.json`.
5. The `production` job waits for approval. **A teammate other than you**
   opens the run, clicks **Review deployments**, ticks `production` and
   approves. GitHub does not let the tagger approve their own deploy.
6. After approval: migrations to production, then `vercel build --prod` and
   `vercel deploy --prod`, then one request to the production URL.

**Check afterwards:**

- The production URL loads and you can sign in.
- `https://study-buddy-jdaws.vercel.app/api/health` shows the new version
  and the tagged commit's SHA, and says the database is reachable. *(V5.)*
- The feature the release was for works on production, not only staging.

**If the gate refuses a tag:** fix the cause, delete the tag
(`git push origin :refs/tags/v1.0.0`, then `git tag -d v1.0.0`), and tag
again. A tag never deploys anything the gate refused.

## Roll back

### The app (no migration involved): Vercel Instant Rollback

This puts the previous production deployment back. Nothing is rebuilt, and it
takes seconds. On the Hobby plan it can only go back one deployment, which is
the one you want.

1. Note the time. The drill reports time from noticing to recovered.
2. **Dashboard:** Vercel → `study-buddy` → Deployments → the previous
   production deployment → ⋯ → **Instant Rollback**. Or, from a laptop that
   is logged in to Vercel:

   ```bash
   npx vercel@65.14.0 rollback            # back to the previous production deployment
   npx vercel@65.14.0 rollback status     # wait until it says it is done
   ```

3. Check `/api/health` shows the **old** version and SHA, and sign in once.
4. **Important:** after an Instant Rollback, Vercel stops pointing the
   production URL at new production deployments by itself. The next good
   release's `vercel deploy --prod` will build fine and **not go live**. Once
   the fixed release has deployed, make it live: Vercel → Deployments → that
   deployment → ⋯ → **Promote**, or `npx vercel@65.14.0 promote <its URL>`.
   Then check `/api/health` again. (Vercel docs, "Instant Rollback": promoting
   "undoes a rollback and restores auto-assignment of production domains".)
5. Fix the bug in a normal pull request, and release it as a new patch
   version (`v1.0.2`, for example). Never re-push an old tag.

### A migration already ran

Instant Rollback changes only the app, not the database. Our migrations are
additive (CLAUDE.md, W7), so the previous app version normally keeps working
on the newer schema, and **rolling the app back is still step one.**

Then fix the database **forward**:

1. Do not edit or delete the migration that ran. Write a new one that undoes
   or corrects it: `npx supabase migration new fix_<what>`, for example a
   `drop function` for a broken function, or a `create or replace` with the
   old body.
2. Test it like any migration: `npm run db:reset` and `npm run test:db` on a
   scratch local stack, then a normal pull request.
3. Merging it applies it to staging (with the smoke tests). Tag a new
   version to apply it to production, as in "Promote to production".
4. If production cannot wait for a release, Actions → Deploy database → Run
   workflow, from `main`, applies main's migrations to staging and then,
   after approval, production, without deploying the app.

Write a down-migration by hand only for a change that is trivially
reversible and has no data depending on it yet (an empty new column).

## Where to look

| Question | Where |
| --- | --- |
| Did the deploy run, and which step failed? | GitHub → Actions → Deploy (or CI). Each job's log says why |
| Is production up, and which version is it? | `/api/health` *(V5)*, and the external uptime check *(V7: name the service and its alert channel here)* |
| What did the server log? | Vercel → `study-buddy` → Logs (or a deployment → Runtime Logs). Filter by the request ID *(V6)*. Security events are single JSON lines; search `"log":"security"` (SEC-09, `src/lib/security-log.ts`) |
| What error did a student hit? | Sentry *(V7: project name and link here)* |
| What is in the database? | Supabase dashboard → the project → Table Editor, SQL Editor, Logs; Auth → Users for accounts |
| Which migrations has a project had? | `npx supabase migration list` after linking to it, or the "Show what will be applied" step in a deploy log |

## Known failure modes

- **Cold start.** The first request after a quiet spell is slow while
  Vercel starts a function and Supabase wakes up. Before a demo, open
  production and sign in once a few minutes early. If the smoke tests fail
  only on a timeout, re-run the job before calling it a real failure.
- **Supabase free project paused.** A free project with no traffic for about
  a week is paused. Pages then error and `/api/health` reports the database
  unreachable. Fix: Supabase dashboard → the project → **Restore**, then wait
  a few minutes. Staging stays awake while things merge; check it before a
  demo and before tagging after a quiet week.
- **Expired secrets.** `VERCEL_TOKEN` and `SUPABASE_ACCESS_TOKEN` have
  expiry dates. A deploy that fails at `vercel pull` or `supabase link` with
  an authentication error usually means one has expired. Create a new one in
  the issuing dashboard and replace the secret in **both** GitHub
  environments, then re-run the job. A Vercel app setting that is missing or
  wrong shows differently: the deploy succeeds, but pages error, or the
  production build fails on purpose when only one Google key is set (BUG-19).
- **Preview protection blocking the smoke tests.** Staging is a Preview
  deployment, which Vercel puts behind its login. If the smoke job sees a
  401, 403, or a Vercel sign-in page instead of ours, the bypass secret is
  missing or out of date. Vercel → Settings → Deployment Protection →
  Protection Bypass for Automation, and copy it into the `staging`
  environment's `VERCEL_AUTOMATION_BYPASS_SECRET`. Do not turn protection
  off.
- **A migration failed partway.** The deploy stops before the app is
  deployed, so the old app keeps running. Do not re-run blindly. Read the
  error, fix forward with a new migration ("A migration already ran"), and
  merge it.
- **Staging and production on the same database by mistake.** SEC-08 again.
  After changing any Vercel variable, check that Preview holds the staging
  project's URL and Production holds production's.
- **Production deploy built but not live.** This is the Instant Rollback
  side effect above: promote the deployment.

## Rollback drill (V8, #154)

**Not yet performed.** Due by 12/8: release a deliberately harmless bad
version (`v1.0.1`) to production, notice it, roll back by following "Roll
back" above, and time it.

- **What was broken:**
- **How it was noticed** (smoke test, uptime alert, Sentry, a person):
- **Steps followed** (and any step this runbook got wrong):
- **Time from noticing to recovered:**
- **What this runbook should have said and didn't:**
