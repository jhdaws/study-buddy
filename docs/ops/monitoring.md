# Monitoring (V7, #153)

What tells us production is broken, before a student does. Two pieces, both
free, both off until someone with the accounts switches them on:

| | What it watches | Where it alerts | Code |
| --- | --- | --- | --- |
| **Uptime check** | `GET /api/health` on production, every 10 minutes: up, and the database answering | One GitHub issue labelled `outage` (emails everyone watching the repo), plus the team chat if a webhook is set. Closes itself when healthy again | `.github/workflows/uptime.yml` |
| **Sentry** | Unhandled errors: a Server Component, Route Handler or Server Action that throws, and a browser error nothing caught | Sentry emails the project's members about each new kind of error (the free plan's default alert) | `src/instrumentation.ts`, `src/instrumentation-client.ts`, `src/lib/monitoring.ts` |

The server logs (V6, `src/lib/log.ts`) are the third source: Vercel →
`study-buddy` → Logs. An alert says *that* something broke; the request's
log lines, found by their `requestId`, say *what*.

## What Sentry is never sent

Cookies, headers, request bodies and query strings, the user's email, name
or IP, and anything shaped like an email address in an error's text
(`scrubEvent()` in `src/lib/monitoring.ts`, unit tested). No performance
tracing and no session replay: errors only, which also keeps us inside the
free plan's quota. Only an opaque user id could identify anyone, and the app
does not set one.

## One-time setup

Each step needs a person with the account; none of it is in the repository.

**Sentry** (whoever owns monitoring; Moses for V7):

1. Sign up at sentry.io (the free Developer plan) and create a project of
   type **Next.js**. Skip the wizard: the code is already in the repo.
2. Copy the project's DSN (Settings → Client Keys).
3. Vercel → `study-buddy` → Settings → Environment Variables, **Production
   only**: add `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`, both set to the DSN.
   Not Preview: staging should not page anyone.
4. Release, or redeploy production, so the browser bundle picks the DSN up.
5. Sentry → Settings → Members: invite the team, so the alert email reaches
   everyone.

**Uptime check** (anyone with admin on the repository; Jack):

1. Once `/api/health` is live on production (V5 released): GitHub →
   Settings → Secrets and variables → Actions → **Variables** → New
   repository variable `UPTIME_CHECK_ENABLED` = `true`.
2. Optional, for the team chat: create an incoming webhook in Slack or
   Discord and save its URL as the repository **secret**
   `UPTIME_WEBHOOK_URL`. The message is sent as both `text` (Slack) and
   `content` (Discord). A GroupMe or iMessage chat has no compatible
   webhook; the GitHub issue email is the alert there.
3. `PRODUCTION_URL` (a repository variable) overrides the default
   `https://study-buddy-jdaws.vercel.app`, if the URL ever changes.

## Proving it works (for the Sprint 5 report)

- **The uptime alert:** Actions → Uptime → Run workflow, with `target` set to
  a URL that fails, such as `https://study-buddy-jdaws.vercel.app/api/no-such-route`.
  It opens an `outage` issue and posts to the chat. Run it again with
  `target` empty: it closes the issue. Screenshot both.
- **A real Sentry error:** the rollback drill (V8, #154) releases a
  deliberately bad v1.0.1. If that version throws, its error lands in
  Sentry with the bad release's commit as its release; screenshot the
  issue. Otherwise, Sentry's project page has a "send a test event"
  button, but a test event is not a real error, so say which it was.

## When an alert fires

Follow `docs/ops/RUNBOOK.md`: "Known failure modes" first (a paused Supabase
project is the usual 503), then "Roll back" if the last release broke it.
The `outage` issue is the place to write down what happened.
