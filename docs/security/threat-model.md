# Threat model -- Study Buddy (Group 4)   (docs/security/threat-model.md)
Last updated: 2026-11-03 · Authors: Jack Dawson (scribe), Nate Dalbert, Moses Banda, Tapan Sidhwani · Covers: main @ `3e89506` + production https://study-buddy-jdaws.vercel.app

There is no separate staging deployment yet: Vercel preview deployments run against the
production Supabase project (W10, #54). That gap is threat T11 below. ICA 15 / Sprint 4 Part 2a;
findings get severities and fixes in Part 2d.

## 1. Data-flow diagram (DFD)
Dashed subgraphs = trust boundaries. Every arrow is labelled with the data that crosses it.

```mermaid
flowchart LR
  subgraph U["Untrusted: internet"]
    user["Student's browser / phone"]
    anyone["Anyone holding the public anon key"]
    inbox["Student's email inbox (Outlook)"]
  end
  subgraph V["Trust boundary: our server (Vercel)"]
    proxy["proxy.ts: session refresh, route guard"]
    app["Next.js app: pages, Server Actions, route handlers"]
  end
  subgraph S["Trust boundary: Supabase (hosted)"]
    auth["Supabase Auth: codes, passwords, JWTs"]
    rest["PostgREST API, RLS enforced"]
    db[("Postgres: profiles, sessions, session_attendees, courses, departments, locations")]
  end
  subgraph T["Third parties"]
    google["Google Places API"]
    mail["Email sender: Supabase built-in or SMTP"]
  end
  subgraph B["Trust boundary: build, deploy and team tooling"]
    gh["GitHub Actions: CI, deploy-db"]
    vbuild["Vercel build"]
    laptop["Team laptop: npm run auth:link"]
  end

  user -- "email, password, sign-in code, form data, auth cookies" --> proxy
  proxy -- "request + refreshed session" --> app
  app -- "HTML / RSC payload, Set-Cookie, .ics file" --> user
  app -- "queries and RPCs as the student: anon key + JWT" --> rest
  rest -- "SQL as role authenticated, RLS applied" --> db
  app -- "sign in, verify code, set password" --> auth
  app -- "locations upsert with secret key, bypasses RLS" --> db
  app -- "place id + server Maps key" --> google
  google -- "coordinates, place types (untrusted)" --> app
  auth -- "one-time code or link" --> mail
  mail -- "sign-in email" --> inbox
  inbox -- "code typed or link clicked" --> user
  anyone -- "REST calls with anon key" --> rest
  anyone -- "sign-up, sign-in, password attempts" --> auth
  gh -- "migrations, SUPABASE_ACCESS_TOKEN" --> db
  gh -- "green main" --> vbuild
  vbuild -- "deploy with env secrets" --> app
  laptop -- "admin generateLink, secret key" --> auth
```

## 2. Assets (what an attacker wants)
| Asset | Where it lives | Why it matters |
|-------|----------------|----------------|
| User accounts / sessions | Supabase Auth (`auth.users`, password hashes, refresh tokens); `sb-*` auth cookies in the browser | **High.** A stolen session or password lets someone host and join sessions as that student. |
| Personal data: Vanderbilt emails | `auth.users` only; the app never selects them (US-25) | **High.** Emails identify students, and keeping them private is a backlog promise. |
| Personal data: where and when a student will be | `sessions` (place, room, time), `session_attendees`, `profiles.display_name` | **High.** Together these tell a stranger where a named student will be, and when. |
| API keys and tokens | Vercel env vars (`SUPABASE_SECRET_KEY`, Google Maps server key); GitHub `production` environment (`SUPABASE_ACCESS_TOKEN`); `.env.hosted` on team laptops; SMTP credentials in the Supabase dashboard | **High.** The secret key bypasses RLS; the access token can change the production schema. |
| Money / quota | Google Cloud billing (Places lookups); Supabase and SMTP email quotas | **Medium.** Abuse runs up cost, or uses the email quota so real students can't sign up. |
| Shared course catalogue | `departments`, `courses` (students add rows) | **Medium.** Junk rows degrade the course picker for everyone. |
| Rosters and seat counts | `session_attendees`, written only by `join_session` / `leave_session` | **Medium.** Fake attendees or overbooking break the core feature. |

## 3. STRIDE table (at least 8 rows, across at least 3 boundaries)
| # | Boundary (A -> B) | STRIDE | Asset | Threat (one sentence) | Existing control | Gap? -> Finding ID |
|---|-------------------|--------|-------|-----------------------|------------------|--------------------|
| T1 | Internet -> Supabase Auth | S | Accounts | Anyone can sign in as the old demo account `njpm@vanderbilt.edu`, whose password is written in `HANDOFF.md` and `docs/ai-usage-log.md` in this public repo, using only the public anon key. | The app code for the demo login was removed (#55, #82). Not confirmed that the hosted user was deleted. | Gap -> SEC-01 |
| T2 | Browser -> Next.js (`/login`) | S | Accounts | An attacker guesses a student's password by trying many logins through `/login` or Supabase's token endpoint. | Supabase Auth limits sign-ins per IP (`sign_in_sign_ups = 30` per 5 min locally; hosted is a dashboard setting); minimum length 8 in the form and `config.toml`; errors never say whether an account exists. | Gap: hosted minimum length not confirmed at 8; no CAPTCHA or lockout -> SEC-02 |
| T3 | Browser -> Next.js (Server Actions) | T | Rosters, sessions | A student forges a Server Action request to create a session as someone else, or to join with another student's id. | Host and joiner come from `auth.uid()` inside SECURITY DEFINER functions, never from the form; `requireUser()` in every action; Next.js checks the Origin of Server Action POSTs. | No gap (tests: `tests/db/session-rules.test.ts`, `tests/db/join-leave-session.test.ts`) |
| T4 | Internet -> Supabase API (anon key) | E | Rosters, profiles | A signed-in student calls PostgREST directly to add themselves to a full session or edit another student's profile. | RLS on every table; no INSERT/UPDATE/DELETE policy on `sessions` or `session_attendees`; `profiles` update limited to your own row and the `display_name` column; `anon` revoked. | No gap (tests in `tests/db/`) |
| T5 | Internet -> Supabase API (anon key) | T | Course catalogue | A signed-in student scripts thousands of junk departments and courses through PostgREST; the insert policy only checks `created_by = auth.uid()`. | Length CHECK constraints (BUG-07); `created_by` records who added each row. | Gap: no rate or count limit -> SEC-03 |
| T6 | Browser -> Next.js (`/sessions`) | I | Where and when a student will be | Any Vanderbilt account can see every open session's place, time and roster names, so someone could track where a named student will be. | Vanderbilt-only sign-up (database trigger); display names, never emails; signed-out visitors see nothing. | Accepted risk by design (US-23); report and block are backlog items US-18, US-22 |
| T7 | Next.js -> Supabase Auth -> email sender | D | Email quota | Anyone can request sign-up codes for many `@vanderbilt.edu` addresses, using up the hourly email limit and sending students unwanted email. | Supabase's 60-second per-address throttle and hourly cap; Vanderbilt-only addresses. | Gap: no CAPTCHA on code requests -> SEC-04 |
| T8 | Next.js -> Google Places | D | Google quota / money | A signed-in student submits the create form in a loop with real place ids, and each submit triggers a billed Places lookup. | Lookups only for signed-in users; 5-second timeout; Google quota cap (M1). Production has no Maps key yet, so only fixture places run. | Gap: no per-user limit (noted in `src/lib/places.ts`) -> SEC-05, before M2 (#84) ships |
| T9 | Internet -> Next.js (our server) | D / E | Whole app | The deployed Next.js 16.4.0 has published advisories (`npm audit`: 1 critical, 2 high), including a denial of service through Server Actions, which we use. | Dependabot; #71 bumps Next.js to 16.4.2, below the fixed 16.4.4. | Gap -> SEC-06 (triage which advisories are reachable) |
| T10 | GitHub Actions -> Supabase (deploy) | T | Database, tokens | A compromised GitHub Action or npm package in the deploy workflow could read `SUPABASE_ACCESS_TOKEN` and change the production database. | The token lives only in the `production` environment and is used only by `deploy-db` on main after CI passes; pull requests from forks get no secrets. | Gap: actions pinned to major tags, not commit SHAs; no secret scan or SAST in CI yet -> SEC-07 |
| T11 | Vercel preview -> Supabase (production) | T / I | All data | Code in any open pull request runs on a Vercel preview against the production Supabase project, so an unreviewed branch can read or change real data. | Previews deploy only for collaborators' branches. | Gap: no staging project (W10, #54) -> SEC-08 |
| T12 | Browser -> Next.js | R | Accounts, rosters | A burst of failed sign-ins or refused joins goes unnoticed, and a student can deny an action, because the app keeps no audit log. | `joined_at` timestamps; Supabase Auth logs; Vercel function logs (short retention); `console.error` on failed RPCs in `src/app/sessions/actions.ts`. | Gap: no app log of failed sign-ins or refused actions -> SEC-09 |
| T13 | Next.js -> Browser | I | Accounts | Supabase's auth cookies are readable by JavaScript, so any XSS would leak sessions, and no Content-Security-Policy or other security headers are set. | React escapes all output; no `dangerouslySetInnerHTML`; `.ics` text escaped (`src/lib/ics.ts`). | Gap: no CSP or security headers (`next.config.ts`) -> SEC-10 |

## 4. OWASP Top 10:2025 checklist -- owner per category
Owners do the manual review in Sprint 4 Part 2c. "Result" is filled in as each check is done.

| Category | Owner | What we checked (where) | Result: pass / finding (ID) / N/A + reason |
|----------|-------|-------------------------|--------------------------------------------|
| A01 Broken Access Control (try changing an ID as another user) | Nate | Open `/sessions/[id]` and `/sessions/[id]/calendar.ics` as another test user; call `join_session`, `leave_session` and PostgREST with another user's ids; update another profile (`src/app/sessions/`, RLS in `supabase/migrations/`) | To do (T3, T4) |
| A02 Security Misconfiguration | Jack | Supabase dashboard (URL configuration, Confirm email, minimum password length); Vercel env var scopes; previews on production data; security headers in `next.config.ts` | To do (SEC-08, SEC-10) |
| A03 Software Supply Chain Failures | Jack | `npm audit --audit-level=high`, `package-lock.json` committed, Dependabot, action pinning in `.github/workflows/` | Finding: SEC-06 (Next.js 16.4.0); SEC-07 |
| A04 Cryptographic Failures | Moses | Passwords hashed by Supabase Auth; HTTPS on `vercel.app`; secrets server-only (`src/lib/env.ts`, `src/lib/supabase/admin.ts`, only the anon key is `NEXT_PUBLIC_`); credentials written in the repo | Finding: SEC-01 (to verify) |
| A05 Injection | Nate | PostgREST filters built from user input (`searchCourses` in `src/lib/sessions.ts`), RPC arguments, React output, `.ics` escaping (`src/lib/ics.ts`), no raw SQL in the app | To do (T13) |
| A06 Insecure Design | Tapan | Seat limit and row lock (`join_session`); limits on catalogue inserts, code requests and Places lookups (T5, T7, T8) | To do (SEC-03, SEC-04, SEC-05) |
| A07 Authentication Failures | Moses | Login rate limit; enumeration in messages (`src/lib/errors.ts`); forgot-password flow (code -> `/login/password`); sign-out ends the session; session expiry | To do (SEC-02) |
| A08 Software or Data Integrity Failures | Jack | Secrets only in GitHub environments; fork PRs can't read them; deploy only from main (`deploy-db.yml`, Vercel production branch) | To do (SEC-07) |
| A09 Security Logging & Alerting Failures | Tapan | Failed sign-ins and refused actions logged without passwords or tokens (`src/app/*/actions.ts`, Supabase Auth logs) | To do (SEC-09) |
| A10 Mishandling of Exceptional Conditions | Tapan | Errors mapped through `src/lib/errors.ts` (no raw Postgres text); `requireUser()` fails closed; `error.tsx` pages; `resolvePlace` failure paths | To do |

## 5. Top 3 risks and next actions
1. **SEC-06: the deployed Next.js 16.4.0 has a critical advisory.** Upgrade `next` to 16.4.4 or later in its own PR, triage which advisories we were exposed to, and add `npm audit --audit-level=high` to the CI security stage so this blocks a pull request next time.
2. **SEC-01: a demo password is public in the repo.** Check Supabase Auth -> Users for `njpm@vanderbilt.edu` and delete it if it exists. Add gitleaks to CI so a committed credential fails the build.
3. **SEC-08: pull-request previews use the production database.** Create the staging Supabase project (W10, #54), give Vercel's Preview environment its keys, and set staging's `SUPABASE_PROJECT_ID` so migrations reach it first.
