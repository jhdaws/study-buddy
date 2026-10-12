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
dashboard, production emails have no code in them.** Ours contains only
`{{ .Token }}`. The link was dropped on 2026-10-12: Vanderbilt mail goes
through Microsoft Outlook, whose link scanning can open a link before the
student does and spend the one-time token (Supabase's email-template docs
warn about this), and the link and the code are the same token, so a
scanned link also broke the code. With no link in the email there is
nothing to scan.

`/auth/confirm` still exists and `signIn()` still passes `emailRedirectTo`,
so an email built from an old or default template lands somewhere that
works, but nothing in the current email points there.

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

### 6. Demo account (`njpm@vanderbilt.edu`, code `123456`)

A fixed account for graders and classmates without a Vanderbilt inbox, and
for demos that should not spend the two-emails-an-hour allowance. Entering
`njpm@vanderbilt.edu` on `/login` sends **no email**; the code step accepts
`123456`. How: `src/lib/demo-account.ts`. The code is the demo user's
**password** in Supabase Auth, so the account has to exist in each project
that should accept it:

- **Hosted:** Authentication → Users → Add user → Create new user. Email
  `njpm@vanderbilt.edu`, password `123456`, **Auto Confirm User** ticked.
  If the dashboard refuses the password as too short or weak, check
  Authentication → Sign In / Providers → Email → minimum password length
  (default 6) and leaked-password protection (Pro plans only).
- **Local:** the same in Studio (http://127.0.0.1:54323), or
  `curl -X POST http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET" -H "Authorization: Bearer $SECRET" -H "Content-Type: application/json" -d '{"email":"njpm@vanderbilt.edu","password":"123456","email_confirm":true}'`
  with the secret key from `npx supabase status`.

A2's signup trigger accepts the address (it is `@vanderbilt.edu`) and makes
its profile; the first sign-in then asks for a display name as usual. Where
the account does not exist, the demo address just gets "That code didn't
work". The address and code are public: never give this account anything
worth protecting, and delete the user to switch the demo off.
