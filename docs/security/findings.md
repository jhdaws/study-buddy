# Security findings -- Study Buddy   (docs/security/findings.md)

Last updated: 2026-11-09 · Sprint 4 Part 2c-2d · Covers main @ `a578559`, plus the open fix PRs named below.
Starts from SEC-01 to SEC-10 in [`threat-model.md`](./threat-model.md). Every severity is
re-assessed below, and SEC-11 to SEC-17 are new from this review. The OWASP check behind each
row is in threat-model.md §4. Scan results are in `scans.md` (#88).

**Severity** (as assigned for Part 2d):
- **Critical:** anyone on the internet can take over accounts or read/change all data, or a live
  secret is exposed.
- **High:** a logged-in user can touch another user's data or bypass an important rule.
- **Medium:** unusual conditions, limited leaks, missing rate limits.
- **Low:** defence in depth, or the impact is small.
- **Info:** no impact on its own.

Where a finding depends on a hosted setting this review could not see (the Supabase or Vercel
dashboard, or GitHub repository settings), it is rated as if that setting is wrong. Its status
says **verify**. Once someone has checked and recorded the setting, re-rate it.

**What "verified" means here.**
- *Locally* means reproduced against the local Supabase stack (`npx supabase start`) or a local
  production build (`next build && next start`).
- Nothing was attempted against production. The proxy in this environment blocks
  `*.vercel.app`, and testing an attack on the live project would also create accounts there.

| ID | Title | OWASP | STRIDE | Location | Severity | How found | Evidence / steps to reproduce | Fix PR | Regression test | Status |
|----|-------|-------|--------|----------|----------|-----------|-------------------------------|--------|-----------------|--------|
| SEC-01 | Old demo account's password is public in the repo | A07 (threat model: A04) | S | `HANDOFF.md:354,382,393`; `docs/ai-usage-log.md:74`; first committed in `5bc3851`; the hosted Supabase Auth user `njpm@vanderbilt.edu` | **Critical** while that hosted user exists: a live credential that gives anyone a signed-in session, and so every session's place, time and roster (T6) | Threat model T1 (Part 2a); re-read in 2c | The address and its six-digit password are in plain text at the lines listed. gitleaks does not flag it, and cannot: the value is below its length and entropy floor (`scans.md` §3). Whether the account still exists was **not checked**; we do not sign in to production with a leaked credential. | None needed in code: the login path was removed (#55, #82). The fix is deleting or re-passwording the hosted user. | None possible by scanning (`scans.md`). Verified by looking in Supabase → Authentication → Users. | Open, **verify** (Moses, A04) |
| SEC-02 | Password guessing meets no lockout or CAPTCHA | A07 | S | `signInWithPassword()` (`src/app/login/actions.ts:194-219`); Supabase `/auth/v1/token`; hosted rate limits | **Medium**: missing limits. Supabase's per-IP limit and an 8-character minimum are the only controls. | Threat model T2; review of `supabase/config.toml` | `config.toml`: `sign_in_sign_ups = 30` per 5 min per IP, `minimum_password_length = 8`, `password_requirements = ""`, and `[auth.captcha]` commented out. Errors never reveal whether an account exists (`errors.ts:205-216`). Hosted values were **not checked**. | None yet. ADR 0009 puts these settings under review. | None yet. ADR 0009 proposes a `supabase config diff` check. | Open (Moses, A07) |
| SEC-03 | No limit on how many departments and courses one student can add | A06 | T | `get_or_create_course()` and the `departments_insert` / `courses_insert` policies (`supabase/migrations/20261001031739_s2_course_normalization.sql:76-145`) | **Medium**: a missing rate limit. Any signed-in student can fill the shared picker with junk. | Threat model T5 | Both insert policies check only `created_by = auth.uid()`. Signed in, `POST /rest/v1/departments` with a new code and your own id succeeds every time; there is no count or rate check anywhere. `tests/db/idor.test.ts` shows you cannot use *someone else's* id, but nothing caps your own. | #129 | `tests/db/catalogue-insert-limit.test.ts`, `src/lib/errors.test.ts` | Fix in review (#129) |
| SEC-04 | Anyone can make the app email any Vanderbilt address, without limit beyond Supabase's | A06 / A07 | D | `signIn()` (`src/app/login/actions.ts:107-135`, `shouldCreateUser: true`); `/auth/v1/otp` | **Medium**: a missing rate limit. It spends the email quota, so real students can't sign up, and it spams students. | Threat model T7 | Any `@vanderbilt.edu` address gets a code email on request. The only controls are Supabase's per-address resend interval and hourly email cap (`config.toml`: `max_frequency = "1s"` and `email_sent = 100` locally; hosted values **not checked**). There is no CAPTCHA. | None yet | None yet | Open (Tapan, A06) |
| SEC-05 | Each create-session submit can trigger a billed Google lookup, with no per-user limit | A06 | D | `resolvePlace()` (`src/lib/places.ts:114-124, 169-174`) | **Low** today: production has no server Maps key, so the path is off (`places.ts:99-107`). **Medium** once M1's key and M2 (#84) ship. | Threat model T8; the file's own comment (`places.ts:122-124`, "NOT done yet: per-user rate limiting") | A signed-in student submitting the form in a loop with real place ids makes one Place Details call per submit. Google's daily quota cap is the only backstop. | #129 | `tests/db/place-lookup-rate-limit.test.ts`, `src/app/sessions/actions.test.ts`, `src/lib/rate-limit.test.ts` | Fix in review (#129) |
| SEC-06 | The deployed Next.js 16.4.0 has published critical advisories | A03 | D / E | `package.json` / `package-lock.json` (`next`, `sharp`, `source-map-js`) | **Critical**: two unauthenticated RCE advisories (GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr), plus a Server Actions DoS (GHSA-p3m5-59mp-jv5r) that this app *is* exposed to | `npm audit` (Part 2a); confirmed in Part 2b | `npm audit --omit=dev --audit-level=high` on main finds 1 critical and 2 high. On 16.4.0, `next build` itself stops with a `SecurityFatalError`. Reachability of each advisory: `scans.md` §3. | #88: next and eslint-config-next 16.4.5, sharp 0.35.5, source-map-js 1.2.2 | The `security` job's npm audit step. It fails on main's lockfile and passes on #88's. | Fix in review (#88) |
| SEC-07 | A compromised GitHub Action could reach the production schema token, and CI had no SAST or secret scan | A03 / A08 | T | `.github/workflows/ci.yml`, `push-migrations.yml` | **Medium**: needs an upstream compromise (unusual), but `SUPABASE_ACCESS_TOKEN` can change the production schema | Threat model T10 | Every `uses:` was a major tag (`@v7`, `@v4`), which can be moved to new code. There was no Semgrep or gitleaks step. | #88 (the `security` job: npm audit, Semgrep, gitleaks); #89 (every action pinned to a commit SHA) | The `security` job; Dependabot keeps the SHA pins current | Fix in review (#88, #89) |
| SEC-08 | Code nobody has reviewed runs against production data on Vercel previews | A02 / A08 | T / I | The Vercel project's Preview environment; the production Supabase project | **High**: a collaborator's branch, or a dependency bump, runs with production's Supabase settings before review | Threat model T11; confirmed on Dependabot's #87 | Vercel built and deployed a preview for #87's branch (`dependabot/npm_and_yarn/minor-and-patch-…`, 2026-11-03, "DEPLOYED"). That is a dependency update no person had reviewed. There is no staging project (W10, #54). **Not checked:** whether Preview also holds `SUPABASE_SECRET_KEY`, which bypasses RLS (Vercel → Settings → Environment Variables). | None yet (W10, #54) | None | Open, **verify** (Jack, A02) |
| SEC-09 | Failed sign-ins and refused actions leave no app record | A09 | R | `src/app/login/actions.ts` (no logging at all); `src/app/sessions/actions.ts:136, 160, 178` (RPC failures only) | **Low**: it slows detection, but nothing leaks | Threat model T12; grep of every `console.*` in `src/` | Nothing in the login actions logs a failed password, code or sign-up. What is logged carries no passwords or tokens: an error code and message, or a place id. Supabase Auth's own logs exist, with short retention. | #129 | `src/lib/security-log.test.ts`, `src/lib/errors.reasons.test.ts`, `src/app/login/actions.test.ts`, `src/app/sessions/actions.test.ts` | Fix in review (#129) |
| SEC-10 | No security headers, and session cookies readable by JavaScript | A02 | I | `next.config.ts` (empty); `@supabase/ssr` cookie defaults | **Low**: no XSS was found to exploit it (React escaping, no `dangerouslySetInnerHTML`, Semgrep clean). Pages can be framed (clickjacking). | Threat model T13; checked locally | `next build && next start`, then `curl -D - /` and `/login`. The only security-relevant header is `X-Powered-By: Next.js`; there is no CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. `@supabase/ssr` sets `httpOnly: false`, `sameSite: "lax"` and `maxAge` of 400 days. Production headers (HSTS is Vercel's) were **not checked**. | #129 | `src/lib/security-headers.test.ts`, `src/proxy.test.ts`, e2e `security headers (SEC-10)` + a CSP-refusal guard on every journey | Fix in review (#129) |
| SEC-11 | **New.** "Confirm email" is an unchecked dashboard toggle, and it is off in `config.toml`: with it off, anyone gets a Vanderbilt account | A07 / A02 | S / E / I | The hosted Supabase Auth setting; `supabase/config.toml:232` (`enable_confirmations = false`); `supabase/README.md` step 7 ("leave on") | **Critical** until the hosted setting is confirmed on (then Info). See [Reproduction: SEC-11](#reproduction-sec-11). | 2c review: `config.toml` checked against README step 7; reproduced locally | Locally, with the public anon key, `POST /auth/v1/signup` with a never-used `@vanderbilt.edu` address and any password returns **200 with a session**, and `email_confirmed_at` is set. No mailbox needed. That bypasses the Vanderbilt-only gate, the control behind T6. A second attempt returns `422 user_already_exists`, which reveals which addresses have accounts. | None (a dashboard setting). ADR 0009 brings it into `config.toml`. | ADR 0009's `config diff` check (proposed) | Open, **verify now** (Jack, A02) |
| SEC-12 | **New.** The 6-digit sign-in code can be guessed: wrong guesses never invalidate it | A07 | S | `verifyCode()` (`src/app/login/actions.ts:154-176`); `/auth/v1/verify`; `config.toml`: `otp_length = 6`, `otp_expiry = 3600`, `token_verifications = 30` | **Medium** if hosted enforces about 30 guesses per 5 min per IP: an even chance within the code's hour needs about 1,400 IPs. **Critical** if no per-IP limit applies. See [Reproduction: SEC-12](#reproduction-sec-12). | 2c review of the A6 flow; reproduced locally | Locally: 40 wrong guesses from one IP all got `403 otp_expired` with no `429`, and the **real code still signed in** afterwards. A code sign-in goes straight to `/login/password` (`actions.ts:171-173`), so a guessed code means full account takeover. The local CLI did not enforce the per-IP limit; hosted was **not tested**. | None yet. Hosted: longer code, shorter expiry, CAPTCHA (SEC-04). ADR 0009. | None yet | Open, **verify** (Moses, A07) |
| SEC-13 | **New.** "Deploy database" can push any branch's migrations to production | A08 | T | `.github/workflows/deploy-db.yml:24-26, 38-54` | **Medium**: needs repo write access, but skips review and CI for the production schema | 2c review of A08 | `workflow_dispatch` (line 26) has no branch condition: line 39 lets any dispatch through, and lines 45 and 54 deploy `github.sha`, which on a dispatch is the head of whichever branch was chosen under "Use workflow from". The comment at lines 24-25 ("Deploys main's current migrations") is true only from main. **Not checked:** whether the `production` environment limits deployment branches (the repository-settings API is blocked here). | None yet (Settings → Environments → production → Deployment branches: `main`; and/or `if: github.ref == 'refs/heads/main'`) | None | Open, **verify** (Jack, A08) |
| SEC-14 | **New.** Client roles keep TRUNCATE and write grants on four tables; RLS is the only barrier | A01 | T | Grants on `sessions`, `session_attendees`, `courses`, `departments` | **Low**: the Data API never issues TRUNCATE, and RLS refuses the rest (`tests/db/idor.test.ts`). But TRUNCATE ignores RLS. | 2c, while writing the A01 test | On the local database, `information_schema.role_table_grants` shows `anon` and `authenticated` with DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE and UPDATE on those four tables. `locations` and `profiles` already revoke them (`*_locations_policies.sql:34`, `*_profile_rules.sql:173-175`). | None yet: a migration revoking TRUNCATE, TRIGGER and REFERENCES; INSERT, UPDATE and DELETE on the two session tables; and everything from `anon` | To add with the fix: assert those privileges with `has_table_privilege` | Open (Nate, A01) |
| SEC-15 | **New.** A password can be changed without re-entering anything | A07 | S / E | `setPassword()` (`src/app/login/actions.ts:236-260`); `/login/password`; `secure_password_change = false` (`config.toml:234`; README step 7) | **Low**: needs an open session, but turns borrowed access into a lockout | 2c review of `setPassword()` | `/login/password` and its action check only `getCurrentUser()`. Any signed-in session, such as one left open on a shared machine (US-21's case), can set a new password at any time. Locally, that also revoked the account's other sessions, signing the owner out everywhere. The owner gets back in with a code. README step 7 justifies leaving the setting off because "the app only asks for a password straight after a code", but the page accepts *any* session. | None yet | None yet | Accepted risk to re-decide (Moses, A07): the stated reason doesn't hold |
| SEC-16 | **New.** Sessions never time out | A07 | S | `@supabase/ssr` cookies (400-day `maxAge`); `config.toml` `[auth.sessions]` (`timebox` / `inactivity_timeout` commented out) | **Low**: a stolen refresh token stays valid until that device signs out | 2c review of A07 "session expiry" | Access tokens last an hour (`jwt_expiry = 3600`), but refresh-token rotation keeps a session alive indefinitely while it's used. Time-boxed sessions are a hosted-plan feature; not checked for this project. | None | None | Open, to decide (Moses, A07) |
| SEC-17 | **New.** Security comments in `places.ts` describe code that no longer exists | A06 | -- | `src/lib/places.ts:99-112, 114-121` | **Info**: the code is right; the reasons a reviewer would read are wrong | 2c AI-code audit (`ai-code-audit.md`) | Lines 115-121 say `requireUser()` "is a stub returning FIXTURE_USER until A4 (#17)", and that until then nobody can sign in in production. A4 replaced the stub (`src/lib/supabase/server.ts:152`), and anyone with a Vanderbilt account can sign in. Lines 108-111 say fixture ids "are not rows in any real database". M5 (#74) now seeds them into local databases. | None yet (a comment-only change) | None | Open (Tapan) |

## Reproduction: SEC-11

These steps run against the **local** stack only; they create accounts. Run `npx supabase start`,
then take `ANON_KEY` and `API_URL` from `npx supabase status -o env`.

1. Sign up through the public API for an address you don't own:
   `POST $API_URL/auth/v1/signup` with headers `apikey: $ANON_KEY` and
   `Content-Type: application/json`, and body
   `{"email":"anyone.<n>@vanderbilt.edu","password":"attacker-chosen-pw"}`.
   - Seen: **200**, with an `access_token` and a `refresh_token`, and `user.email_confirmed_at` set.
     The account is signed in and counts as confirmed. No email was opened.
2. Repeat step 1 with the same address.
   - Seen: **422** `user_already_exists`, "User already registered". This tells anyone which
     addresses have accounts, bypassing the care `errors.ts` takes over this.
3. What happens when the real student turns up:
   - They request a code (`/auth/v1/otp`) and verify it (`/auth/v1/verify`). They land in the
     **attacker's account** (same `user.id`), and the attacker's refresh token **still works**.
   - Only when they then set a password (`PUT /auth/v1/user`, the app's `/login/password` step)
     does GoTrue revoke the attacker's refresh token (seen: `400 refresh_token_not_found`).

Steps 1 and 2 behave this way only with "Confirm email" off. On a correctly configured project,
step 1 returns no session, and step 2 returns an obfuscated user rather than a 422. The fix is
to confirm the hosted toggle, then make `config.toml` match (ADR 0009). Turning it on locally
should also make the e2e suite exercise the production behaviour.

## Reproduction: SEC-12

Local stack only.

1. Request a code for a new address: `POST /auth/v1/otp` with
   `{"email":"guess.<n>@vanderbilt.edu","create_user":true}`.
2. Send 40 wrong codes from one IP: `POST /auth/v1/verify` with
   `{"type":"email","email":…,"token":"000001"}` and so on.
   - Seen: every one `403 otp_expired`; no `429`.
3. Read the real code from Mailpit (`/api/v1/messages`) and verify it.
   - Seen: **200**. Wrong guesses do not use up or invalidate a code.

The arithmetic for the hosted project, if it enforces the default limit: 10^6 codes and
30 guesses per 5 minutes per IP is 360 guesses per IP per hour. Half the space in the code's
one-hour life is 500,000 guesses, about 1,400 IPs. That is a distributed attack, not a script on
a laptop, and the victim does get an unexpected code email. Neither is a control.

Ways to shrink it, all hosted settings:
- an 8-digit code (100× the space);
- a 10-15 minute expiry;
- a CAPTCHA on code requests (also fixes SEC-04).
