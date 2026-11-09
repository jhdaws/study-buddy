# ADR 0009 — Security-relevant auth settings live in `config.toml`, and CI checks them against the hosted project

**Status:** Proposed · **Date:** 2026-11-09
**Made because of:** the Sprint 4 Part 2c security review, `docs/security/findings.md`: SEC-11
(Critical until verified), SEC-12, SEC-02, SEC-15 and SEC-16

## Context

The 2c review found that the auth properties that matter most are not in the code. They are
toggles in the hosted Supabase dashboard:
- Whether a new address must prove it owns its mailbox ("Confirm email"): SEC-11.
- How long and how guessable a sign-in code is, now that a code can reset a password: SEC-12.
- How many guesses an IP gets, and the minimum password length: SEC-02.
- Whether changing a password needs a recent sign-in: SEC-15.

Today the only record of those settings is prose in `supabase/README.md`, such as "Leave
**Confirm email** on". That has three problems:

1. **Nobody can see them in review.** A PR can't change them, so a PR can't be checked against
   them. The review couldn't confirm a single hosted value: it has no dashboard access, and
   nothing in the repository records what was set.
2. **The repository holds the opposite value.** `supabase/config.toml` has
   `enable_confirmations = false`, the CLI's default. So every local run, every `tests/db/`
   run and every CI e2e journey uses the setting that, in production, would let anyone create
   a Vanderbilt account. Reproduced locally (findings.md, "Reproduction: SEC-11"). The tests can
   never catch that drift, because they test the drifted value.
3. **Drift is silent.** If someone flips a toggle in the dashboard, nothing notices.

The Supabase CLI in `package.json` (2.120.0) has two commands for this:
- `supabase config diff` is read-only. It shows how `config.toml` differs from a linked project.
- `supabase config push` writes the properties `config.toml` declares, after a per-resource
  confirmation, and leaves undeclared properties alone.

`deploy-db.yml` already links the hosted projects, with `SUPABASE_ACCESS_TOKEN` in the
`staging` and `production` environments.

## Decision

1. **`supabase/config.toml` holds production's values for the security-relevant auth keys**, so
   local runs and tests use the same security behaviour as production. The keys:
   - under `[auth]`: `minimum_password_length`, `password_requirements`, `enable_signup`,
     `enable_anonymous_sign_ins`;
   - under `[auth.email]`: `enable_confirmations`, `secure_password_change`, `otp_length`,
     `otp_expiry`, `max_frequency`;
   - under `[auth.rate_limit]`: `sign_in_sign_ups`, `token_verifications`, `email_sent`;
   - `[auth.captcha]`, once SEC-04 adds it.

   A change to any of them is a PR, reviewed like code, with the reason in the PR. Values that
   *must* differ locally (`site_url`, `additional_redirect_urls`, local email limits for the e2e
   suite) are outside this list and are documented beside each key.
2. **CI checks for drift, read-only.** A step in `deploy-db.yml`, in each environment's job
   after "Link the project", runs `supabase config diff`. It fails if any listed key differs from
   the hosted project. It needs no new secret, and it can't change anything.
3. **Applying a change stays a person's job**, until we've confirmed per-project overrides keep
   local-only values from being pushed. After the PR merges, the owner runs
   `supabase config push` against staging, then production, and reviews each diff it prints.
   The drift check then turns green.
4. **First use is SEC-11.**
   - Confirm "Confirm email" is on in the hosted project, and record it.
   - Set `enable_confirmations = true` in `config.toml`.
   - Run the e2e suite with it on. Sign-up is by code, and a code confirms the address, so the
     journeys should be unaffected; that has not been tested yet.

## Consequences

**Good**
- Every security-relevant auth setting is visible in the repository and changed by review.
- Local and CI runs exercise production's security behaviour, so a test can catch what
  SEC-11's drift hid.
- Drift from a hand edit in the dashboard is noticed on the next deploy.

**Bad**
- The check runs after merge, in `deploy-db.yml`, not on PRs: only the environment jobs hold
  the token, and fork PRs must never get it. A drifting dashboard is caught late, not prevented.
- Production values in local config change local behaviour. For example, an 8-digit code or a
  stricter verification limit could slow the e2e suite. Any key that has to differ for tests is
  pulled out of the list *explicitly*, with the reason in a comment.
- It depends on `config diff`'s coverage. A key the CLI cannot diff stays a dashboard-only
  setting and goes on a checklist in `supabase/README.md`.

**What to watch**
- Whether `config diff`'s output is stable enough to fail on. If it isn't, compare the
  Management API's auth config (`GET /v1/projects/{ref}/config/auth`) with the listed keys
  instead.
- Free-plan limits. Some protections the review recommends, such as time-boxed sessions
  (SEC-16), may not be available on this project's plan. Record that, rather than leaving the
  key unset in silence.

## Rejected

- **Keep the dashboard as the source of truth, with a README checklist.** This is what we have,
  and it's how SEC-11 happened: the README says "leave on", and nobody could say whether it is.
- **`supabase config push` on every deploy.** It writes to production on every merge with the
  production token. It would also push local-only values such as `site_url = localhost`, unless
  per-project overrides work as documented. That is unverified in this CLI, and a wrong push
  would break sign-in for everyone.
- **Check the settings from the app at runtime.** That needs the secret key in a code path that
  doesn't otherwise need it, costs a request, and fails in the wrong place (a student's page
  load), not in review.
- **Do nothing until a staging project exists (W10, #54).** Staging helps SEC-08, not this: a
  staging project with its own unchecked dashboard has the same problem twice.
