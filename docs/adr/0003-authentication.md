# ADR 0003 — Vanderbilt-only sign-in by emailed magic link

**Status:** Proposed — not yet ratified by the team · **Date:** 2026-09-17

## Context

The report described three incompatible authentication plans at once: magic
links via Resend or SendGrid (Part A), Supabase auth with JWTs validated
against Redis (Part A, a few lines later), and "verify via Okta" (Part C,
US-01).

Okta is Vanderbilt's institutional SSO. Registering an OAuth/SAML client with
university IT for a one-semester course project is, at best, a process with a
timeline outside our control — and discovering that in October would cost us a
sprint. We also cannot assume which provider backs Vanderbilt email without
checking, which makes any "sign in with Google" or "sign in with Microsoft"
plan contingent on a fact we have not verified.

## Decision

**Supabase email OTP ("magic link"), restricted to `@vanderbilt.edu`, enforced
in the database.**

A student enters their Vanderbilt address and receives a one-time sign-in link.
Possession of a `vanderbilt.edu` inbox *is* the verification.

The domain restriction is enforced in three places, only one of which matters:

| Layer | File | Purpose |
| --- | --- | --- |
| Client-side form | `src/lib/validation.ts` | Instant, specific feedback |
| Server action | `src/app/login/actions.ts` | Rejects before calling Supabase |
| **Database trigger** | `supabase/migrations/0001_init.sql` | **The actual enforcement** |

The `enforce_vanderbilt_email` trigger fires `before insert on auth.users`, so
an attacker calling the Supabase auth API directly — bypassing our UI entirely —
still cannot create an account. The other two layers exist only for error
quality.

## Consequences

**Good.** Works regardless of who runs Vanderbilt's mail. No OAuth consent
screen, no app verification, no dependency on university IT approving anything.
No password storage or reset flow to build. No cost.

**Bad.** Sign-in requires a round trip through email, which is slower than an
SSO redirect and depends on Supabase's email deliverability. On the free tier,
Supabase rate-limits outbound auth email — fine for 10–15 users, but if we ever
needed volume we would configure a custom SMTP provider.

**Rejected:** Okta/Vanderbilt SSO (approval process outside our control);
Google or Microsoft OAuth with a domain restriction (contingent on an
unverified fact about Vanderbilt's mail provider, and re-introduces a consent
screen); passwords (more to build, worse security, no verification value).

## Follow-up

Sessions currently last as long as Supabase's default refresh window. If we
want explicit expiry or a visible "sign out everywhere", that is US-21 in the
backlog, not something this decision settles.
