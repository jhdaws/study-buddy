# Supabase

Local development is set up — `config.toml`, and `npm run db:start` brings up
the whole Supabase stack in Docker (see the root README). The schema is
agreed in [ADR 0008](../docs/adr/0008-sprint-2-schema-decisions.md).

## What goes here

```
supabase/
  migrations/        Timestamped SQL migrations, applied in filename order
  seed.sql           Starter data loaded by `supabase db reset` (W3)
  config.toml        Created by `supabase init`
  templates/         Auth email templates (A1) -- also pasted into the dashboard
```

## The schema today

`migrations/*_profile_rules.sql` (A2) adds the first rules: Vanderbilt-only
`auth.users` (on signup and on an email change), a profile row per new user,
the `display_name` CHECK, and the profiles policies and grants. Its functions
live in a `private` schema the Data API does not expose. **It was written
without Docker and has not yet been applied to a Supabase database** — run
`npm run db:reset && npm run test:db` before relying on it.

The first migration, `migrations/*_schema_skeleton.sql` (W2), creates every
Sprint 2 table as **structure only**: `profiles`, `departments`, `courses`,
`locations`, `sessions`, `session_attendees`, and the `session_status` enum.
The migration's header says which track owns which table.

**Row Level Security is enabled on every table, with no policies** — except
`profiles` (A2) and `locations`, where M3's migration
(`*_locations_policies.sql`) lets signed-in users read and revokes client write
grants. Nothing else is readable or writable through the Data API until the
owning track adds its policies. That is intended — a missing policy fails closed. Do not add broad
policies to "make it work". `tests/db/rls.test.ts` fails if any table in
`public` is created without RLS.

The rules each track adds, in its own migration:

| Track | Adds |
| --- | --- |
| A2 | Signup triggers (Vanderbilt-only, create the profile row); profile policies |
| S1 | Session `CHECK`s; `create_session`; session and roster policies |
| S2 | Normalisation and create-on-use for departments and courses; their policies |
| M3 | Read policy on `locations`; rows written only by the server — **written, not yet run** |

Decisions every migration should respect (ADR 0008):

- **Seats left are derived** from `session_attendees`, never stored.
- **Joining goes through a database function holding a row lock** (later
  sprint) — never a plain client `INSERT`.
- **Email is never copied into `profiles`.** It stays in `auth.users`.
- **Views bypass RLS** unless created `with (security_invoker = true)`.

## Adding a migration

```bash
npx supabase migration new <name>   # one per PR
npm run db:reset                    # re-applies every migration, then seed.sql
npm run db:types                    # regenerate src/lib/database.types.ts -- commit it
npm run test:db                     # includes the RLS guard and the seed check
```

Never edit a migration once it has merged; add a new one. CI fails if the
committed `database.types.ts` does not match the migrations.

`seed.sql` is generated from `data/` by `npm run db:seed` — edit the JSON,
not this file. See [`data/README.md`](../data/README.md).

## Deploying migrations (W7, W10)

Merging to `main` applies new migrations to the hosted databases by itself:
`.github/workflows/deploy-db.yml` waits for CI to pass on that push, then runs
`supabase db push --include-all` against **staging**, then **production**. If
staging fails, production is not touched. Vercel deploys the app from the same
push in parallel, so **a migration must work with the app version already
live**: add columns, tables, functions and policies freely, but rename or drop
in two steps. The seed is never pushed from CI.

To re-run it (after fixing a secret, say): Actions → Deploy database → Run
workflow. To see what it would do, from a machine linked to the project:
`npx supabase db push --include-all --dry-run`.

### One-time setup (repo admin)

GitHub → Settings → Environments. For each of `production` and `staging`,
create the environment and add:

| Name | Kind | Value |
| --- | --- | --- |
| `SUPABASE_PROJECT_ID` | Variable | The project ref: the part of its URL before `.supabase.co` |
| `SUPABASE_ACCESS_TOKEN` | Secret | A personal access token from supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Secret, **optional** | Not needed: with only the access token, the CLI connects through a temporary login role (checked 2026-10-13). Add the database password only if that ever fails |

An environment without `SUPABASE_PROJECT_ID` is skipped with a notice. Until
W10 creates a staging project, leave `staging` empty, and the workflow deploys
to production only.

### A staging database for previews (W10)

Vercel previews should not use the production database. The free option is a
second Supabase project that previews share:

1. Create the project in the dashboard (`study-buddy-staging`).
2. Load its schema and the seed once, without relinking your machine, using
   the connection string from its **Connect** button:
   `npx supabase db push --db-url "<staging connection string>" --include-seed`
3. Fill in the `staging` environment above. From then on, merges deploy to it
   first.
4. In Vercel → Settings → Environment Variables, make each of
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `SUPABASE_SECRET_KEY` **Production only**, and add the staging project's
   values for **Preview**. Redeploy a preview to pick them up.
5. Sign in on a preview with `npm run auth:link`, using the staging keys in
   `.env.hosted` and `SIGN_IN_SITE_URL` set to the preview's URL (step 6 below).

Staging follows `main`, not each PR: a preview of a PR that adds a migration
runs without it until the PR merges. CI's `db` job is what tests a PR's
migrations. Supabase's per-PR preview branches would close that gap, but they
are switched off in the integration settings and may need a paid plan.

## Hosted auth settings (A1)

Sign-in (A3/A4) needs settings that live in the hosted project's dashboard,
not in this repository. **None of these has been applied yet** — a human with
access to the Supabase project has to make them. Locally, `config.toml`
already has the equivalent: `site_url` is `http://localhost:3000`, localhost
is on the redirect list, and both sign-in emails use
`templates/magic_link.html`. Local emails never leave your machine; read them
in Mailpit at http://127.0.0.1:54324.

### 1. Authentication → URL Configuration

- **Site URL:** `https://study-buddy-jdaws.vercel.app` — no trailing slash.
  The email no longer contains a link, but Supabase still checks
  `emailRedirectTo` against this and the list below.
- **Redirect URLs** — add:
  - `https://study-buddy-jdaws.vercel.app/**`
  - `http://localhost:3000/**` and `http://127.0.0.1:3000/**` — for
    `npm run dev` against the hosted project
- **Vercel previews — read before adding.** Supabase's docs suggest
  `https://*-<team-slug>.vercel.app/**`. Here that would be
  `https://*-jdaws.vercel.app/**` (the slug is inferred from the production
  URL, not checked). **Do not add it without discussing it first:** `*`
  matches any characters except `.` and `/`, so anyone who names their own
  Vercel project `something-jdaws` gets a matching `*.vercel.app` address.
  An attacker could then request a sign-in email *for a student's address*
  with their own site as the redirect; the student gets a genuine Study
  Buddy email, and clicking its link hands the attacker the token. Safer:
  no preview pattern (a preview's sign-in link then falls back to
  production — see the template below), or one exact branch URL at a time
  (`https://study-buddy-git-<branch>-jdaws.vercel.app/**`) while testing it.
  Previews are also behind Vercel's login today (W1).

What the redirect list does: `signIn()` asks for
`<the site the student is on>/auth/confirm?next=…`. Supabase uses that only
if it matches this list (or the Site URL); otherwise it substitutes the Site
URL. A forged `Host` header can therefore never send a link anywhere
unlisted.

### 2. Authentication → Emails → Templates

**Locked until custom SMTP is set up** (found 2026-10-11). On this plan the
dashboard shows "Set up custom SMTP to edit templates" and sends Supabase's
default emails: a link through Supabase's own `/verify` and no code, which
this app cannot finish signing in with. So step 4's custom SMTP comes first.
Until then, use the stopgap in step 6.

Set **both "Confirm signup" and "Magic link"** — `signInWithOtp()` sends
*Confirm signup* to a first-time address and *Magic link* to a returning
one. Same subject and body for both:

- **Subject:** `Your Study Buddy sign-in code`
- **Body:** paste the whole of
  [`templates/magic_link.html`](./templates/magic_link.html), unchanged.

What the template does: it carries **the code (`{{ .Token }}`) and nothing
else**. Students type it into `/login` (A3's `verifyCode()`); it works on any
device, whichever one opened the email.

**Codes, not magic links.** Supabase has no "send codes" switch:
`signInWithOtp()` always sends the *Magic link* (or *Confirm signup*)
template, and the template alone decides whether the student gets a link,
a code, or both. Supabase's default template contains only a link
(`{{ .ConfirmationURL }}`), so **until this template is pasted into the
dashboard (which needs custom SMTP first, above), production emails have no
code in them.** Ours contains only
`{{ .Token }}`. The link was dropped on 2026-10-12: Vanderbilt mail goes
through Microsoft Outlook, whose link scanning can open a link before the
student does and spend the one-time token (Supabase's email-template docs
warn about this), and the link and the code are the same token, so a
scanned link also broke the code. With no link in the email there is
nothing to scan.

`/auth/confirm` still exists and `signIn()` still passes `emailRedirectTo`:
until the template can be changed, Supabase's default link email is what
production sends, and it lands there.

### 3. Authentication → Sign In / Providers → Email

- **Email OTP Length:** check it. The form accepts 6 to 10 digits, the
  whole range Supabase allows, so any value works; 6 matches `config.toml`.
  Some hosted projects reportedly default to 8.
- **Email OTP Expiration:** 3600 seconds (one hour) — the default, and what
  the email and `/login` tell students.
- Leave **Confirm email** on.

### 4. Email delivery and rate limits — matters for the demo

From Supabase's docs (SMTP and rate-limit pages), checked 2026-09-30:

- The **built-in email service sends 2 emails per hour, for the whole
  project**, and that limit cannot be raised without custom SMTP.
- It **delivers only to addresses of the project's team members** (the
  Supabase organization). Anyone else gets `email_address_not_authorized`,
  which `/login` shows as "We can't send sign-in emails to that address
  yet".
- A single address can request a new email only **once every 60 seconds**.
- Code and link verifications: 30 per 5 minutes per IP address.

So with the built-in service, the Sprint 2 "done when" — two people signing
in on production — works only if **both are members of the Supabase
organization**, and only twice an hour between them. For anything wider
(other testers, a class demo), set up **custom SMTP** (Authentication →
Emails → SMTP Settings; any provider — Resend, SendGrid, Postmark — with a
verified sender domain) and then raise the email rate limit under
Authentication → Rate Limits. Its credentials belong in the dashboard only,
never in this repository.

**Without custom SMTP (where the hosted project is now).** Supabase sends
its own default email: a link and no code, because our template stays locked
(step 2). That link goes through Supabase and comes back to `/auth/confirm`
with a one-time `code`. Since A5, `/auth/confirm` exchanges it, so **the link
signs the student in when opened on the device and browser they asked
from**. Opened anywhere else, it fails with a message saying so. To sign
people in on production this way:

1. Do step 1 (URL Configuration), or the link comes back to the Site URL
   default (`localhost`) instead of production.
2. Add each tester to the Supabase organization (Organization settings →
   Team → Invite), because the built-in sender only delivers to members.
3. Each tester asks for the email on the device they will use, and opens the
   link there. The code boxes on `/login` stay empty: this email has no code.
4. Mind the limit of 2 emails an hour for the whole project. For more, use
   step 6 (`npm run auth:link`) or custom SMTP.

### 5. Not a Supabase setting, but blocks sign-in

Production was behind Vercel's login (Deployment Protection — W1). Turned off:
checked 2026-10-11, `/` and `/login` return 200 to a signed-out visitor.

### 6. Signing in without email — a demo stopgap

Until step 4 is done, nobody can sign in on production by email. For the
Sprint 2 demo, the project owner can make a one-time sign-in link without
sending anything:

1. Create `.env.hosted` in the repo root (ignored by git, like every
   `.env*`) with the **hosted** project's `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SECRET_KEY` (Project Settings → API Keys, the secret key).
2. `npm run auth:link -- name@vanderbilt.edu`
3. Send the printed link to that person. It signs them in on any device,
   once, within the hour; a first-time address gets an account and the
   name step.

It skips proving the person owns the inbox, which is why only someone with
the secret key can run it, and why it is a stopgap rather than a feature.
The Vanderbilt-only rule still holds. `scripts/sign-in-link.mjs` has the
details.

### 7. Test login (`group4@vanderbilt.edu`), for local and previews only

For building and testing without the email limits. Entering the test address
on `/login` sends **no email**; the code step takes the test user's
**password**, checked by Supabase (`signInWithPassword`). How:
`src/lib/test-login.ts`.

It is **off on production**: the app ignores it whenever Vercel says the
deployment is production (`VERCEL_ENV=production`), whatever else is set.
Locally it is off unless `TEST_LOGIN_EMAIL` is set.

**The code is never written in this repository** (the repo is public). Share
it with the team privately. To set it up:

1. Pick a random code of **6 to 10 digits** (the code field accepts only
   that). Longer is better; 10 digits is a good choice.
2. **Create the user.** Hosted: Authentication → Users → Add user → Create
   new user, email `group4@vanderbilt.edu`, the code as the password, **Auto
   Confirm User** ticked. Local: the same in Studio
   (http://127.0.0.1:54323).
3. **Turn it on.** Vercel previews already have it on for
   `group4@vanderbilt.edu` (`DEFAULT_PREVIEW_TEST_EMAIL`), because only the
   project owner can set Vercel variables; `TEST_LOGIN_EMAIL` in Vercel's
   Preview environment overrides the address. Locally, set
   `TEST_LOGIN_EMAIL=group4@vanderbilt.edu` in `.env.local`.

A2's signup trigger accepts the address and makes its profile; the first
sign-in asks for a display name as usual. One limit to know: previews and
production share the hosted project, so the account exists there too, and
anyone holding the password could sign in through Supabase's API directly.
That is why the password stays private and long. To switch it off, delete the
user.
