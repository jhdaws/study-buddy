# ADR 0011 — Rate limits live in the database, not in the app

**Status:** Accepted · **Date:** 2026-11-11
**Comes from:** the Sprint 4 security audit (findings SEC-03, SEC-05; threat
model T5, T8). This is the security ADR the Sprint 4 brief asks for.

## Context

The audit found two places where one signed-in student could do something
without limit:

- **SEC-03:** add departments and courses to the shared catalogue. The insert
  policies check *who* inserts (`created_by = auth.uid()`), not *how many*.
- **SEC-05:** make the server run a billed Google Place Details lookup, once
  per create-session submit.

Both needed a per-student limit. The question was where to enforce it.

The browser talks to Supabase two ways: through our Next.js server, and
directly, because the anon key and the project URL are public
(`NEXT_PUBLIC_*`). SEC-03's inserts can come straight from PostgREST without
touching our server at all. A limit in a Server Action would only stop the
students who use our forms.

## Decision

**Every rate limit is enforced in Postgres, by the database itself.**

- **Inserts a client can make directly** (SEC-03) are limited by a
  `BEFORE INSERT` trigger on the table: 10 rows an hour and 30 a day per
  student. Going around the app reaches the same trigger.
- **Work only the server does** (SEC-05, the Google lookup) is limited by
  `consume_rate_limit(bucket)`, a SECURITY DEFINER function the server calls
  before the work. The caller can't choose a bucket's limit: it comes from
  `private.rate_limit_rules`.
- **Both count by `auth.uid()`**, never by an id from the form, and both refuse
  with SQLSTATE `PT429`, so PostgREST answers HTTP 429. `src/lib/errors.ts`
  maps each to wording a student understands.
- **Both fail closed.** If the check itself errors, the work does not happen.
- **The numbers live in the database.** `src/lib/limits.ts` keeps copies to
  word messages and size tests; tests check that the two agree.

## Consequences

- One mechanism to test. `tests/db/catalogue-insert-limit.test.ts` and
  `tests/db/place-lookup-rate-limit.test.ts` run against real Postgres,
  including the race for the last slot.
- A new limit is a migration, not an app change. Any new caller of a limited
  path (for example `editSession()`, which also calls Google) must spend the
  same bucket; `src/lib/places.ts` says so where the lookup lives.
- Limits are per student, not per IP. Sign-in and sign-up limits (SEC-02,
  SEC-04) happen before there is a student, so they stay with Supabase Auth's
  hosted settings (ADR 0009), and are deferred.
- Counting rows costs a query per insert or lookup. At our scale that is
  nothing; the counting columns are indexed.
