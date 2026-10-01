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

**Row Level Security is enabled on every table, with no policies** (A2 has
since added the policies for `profiles`). Nothing
is readable or writable through the Data API until the owning track adds its
policies. That is intended — a missing policy fails closed. Do not add broad
policies to "make it work". `tests/db/rls.test.ts` fails if any table in
`public` is created without RLS.

The rules each track adds, in its own migration:

| Track | Adds |
| --- | --- |
| A2 | Signup triggers (Vanderbilt-only, create the profile row); profile policies |
| S1 | Session `CHECK`s; `create_session`; session and roster policies |
| S2 | Normalisation and create-on-use for departments and courses; their policies |
| M3 | Read policy on `locations`; rows written only by the server |

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

## Hosted auth settings (A1)

Sign-in (A3/A4) needs settings that live in the hosted project's dashboard,
not in this repository. **None of these has been applied yet** — a human with
access to the Supabase project has to make them. Locally, `config.toml`
already has the equivalent: `site_url` is `http://localhost:3000`, localhost
is on the redirect list, and both sign-in emails use
`templates/magic_link.html`. Local emails never leave your machine; read them
in Mailpit at http://127.0.0.1:54324.

### 1. Authentication → URL Configuration

- **Site URL:** `https://study-buddy-jdaws.vercel.app` — **no trailing
  slash**: the email template appends `/auth/confirm` to it.
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

Set **both "Confirm signup" and "Magic link"** — `signInWithOtp()` sends
*Confirm signup* to a first-time address and *Magic link* to a returning
one. Same subject and body for both:

- **Subject:** `Your Study Buddy sign-in code`
- **Body:** paste the whole of
  [`templates/magic_link.html`](./templates/magic_link.html), unchanged.

What the template does:

- **The code (`{{ .Token }}`) comes first.** Students type it into
  `/login` (A3's `verifyCode()`). It works on any device, whichever one
  opened the email.
- **The link is second:** `{{ .RedirectTo }}&token_hash=…&type=email`.
  `RedirectTo` is what `signIn()` asked for — always
  `<origin>/auth/confirm?next=…`, so it already has a `?` and the template
  appends with `&`. That one template works for production, previews and
  localhost, because the link goes back to whichever site sent it. If
  Supabase rejected the redirect and substituted the Site URL, the
  `{{ if eq .RedirectTo .SiteURL }}` branch builds
  `<Site URL>/auth/confirm?token_hash=…` instead, which signs the student
  in on production rather than producing a broken link.
- **Why not the default template:** its `{{ .ConfirmationURL }}` goes
  through Supabase's own `/verify` endpoint, which hands back either a
  session in the URL fragment (a server cannot read it) or a PKCE `?code=`
  that only the browser that asked for the email can exchange. `/auth/confirm`
  takes `token_hash` instead (Supabase's server-side auth docs), which works
  from any browser.

**Mail scanners — a known risk, unresolved.** Supabase's email-template docs
warn that scanners such as Microsoft Defender may open links in an email
before the recipient does, which spends a one-time token. Vanderbilt mail
goes through Microsoft Outlook. The code was added so a student has another
way in — but **the code and the link are the same token**: if a scanner
opens the link, the code stops working too. Whether Vanderbilt's scanning
actually prefetches has not been tested. If it does, the fix is to make the
link harmless to open: `/auth/confirm` shows a "Finish signing in" button
and only a POST spends the token (Supabase's suggested option 2), or the
email carries the code only. See `HANDOFF.md`.

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

### 5. Not a Supabase setting, but blocks sign-in

Production is behind Vercel's login (Deployment Protection — W1). Until that
is turned off for production, a student following an emailed link hits
Vercel's sign-in page, not `/auth/confirm`.
