# ADR 0010 — Account deletion uses the secret key, and a trigger cancels hosted sessions

**Status:** Proposed · **Date:** 2026-11-10
**Amends:** [ADR 0008](./0008-sprint-2-schema-decisions.md) rule 12 ("the
secret key is used for location writes and nothing else")

*Numbering: 0009 is taken by the auth-settings ADR in the Sprint 4 security
review PR (#92), not yet merged when this was written.*

## Context

US-24: *"As a student, I want to delete my account and my data."* ADR 0008
already decided what deletion means (rule 5, and "What happens on delete"):

- It is a **hard delete** of the `auth.users` row. A soft-deleted user keeps
  their row, so none of the cascades fire.
- The foreign keys do the rest. The profile and roster rows are deleted, and
  `host_id` and `created_by` are set to null ("Deleted user").
- The student's upcoming hosted sessions are cancelled **in the same
  transaction, before** the user row goes. No foreign key can do that.

Two things were left open: who is allowed to delete an `auth.users` row, and
where the cancellation lives.

Supabase Auth deletes users only through its admin API
(`auth.admin.deleteUser`), and that API only accepts the **secret key**.
ADR 0008 rule 12 allowed the secret key for one job, writing `locations`, and
`src/lib/supabase/admin.ts` says any other use is an ADR change. This is that
change.

## Decision

1. **`deleteAccount()`** (`src/app/account/actions.ts`) works like this:
   - It calls `requireUser()` and takes the user id from that, **never from the
     request**.
   - It checks the confirmation box (`deleteAccountSchema`).
   - It calls `createAdminClient().auth.admin.deleteUser(id)`, which is a hard
     delete (the default, `shouldSoftDelete: false`).
   - It then signs the device out and redirects to `/?account=deleted`.

   The secret-key client is created inside the action and used for that one
   call.
2. **The cancellation is a `BEFORE DELETE` trigger on `public.profiles`**
   (`*_delete_account.sql`):
   - It cancels the student's `open` sessions whose `ends_at` is still in the
     future.
   - Deleting the auth user cascades to `profiles`, so the trigger runs inside
     Supabase Auth's own delete statement. It is one transaction: if the cancel
     fails, nothing is deleted.
   - It applies however an account is deleted: this action, the Supabase
     dashboard, or SQL.
3. **The secret key now has exactly two uses**: location writes (M3) and this
   one. `admin.ts` and `env.ts` list both. Anything else is still an ADR
   change.

## Consequences

**Good.** ADR 0008's deletion rules hold whoever does the deleting, and no
step can leave an account gone with its sessions still open. No new client
grants, no UPDATE policy on `sessions`, and nothing new in the `auth` schema:
the trigger is on `public.profiles`.

**Bad: one more server path holds a key that bypasses RLS.** The action is
small and does one call with an id the request cannot choose (unit tested in
`src/app/account/actions.test.ts`). A bug that let the form name the user
would let any student delete any account, so the test checks that a
submitted id is ignored.

**Bad: production needs `SUPABASE_SECRET_KEY` for this to work.** It is
already required by `resolvePlace()`. Without it the action shows "nothing
was deleted" and logs why; it never half-deletes.

**Watch.** The confirmation is a checkbox, not a password re-entry. A
signed-in device left unattended can delete its account. Re-authentication
(Supabase's `reauthenticate()` nonce, or a fresh password sign-in) is a
reasonable follow-up if the threat model rates it.

**Watch.** `requireUser()` sends a student without a display name or
password to those steps first, so they have to finish signing up before they
can delete. That is acceptable for now. A dashboard deletion by the team
covers the edge case, and the trigger applies there too.

## Rejected

- **A `SECURITY DEFINER` RPC that deletes from `auth.users` directly.** It
  needs no secret key in the app. But it writes to Supabase Auth's tables
  behind its back, it depends on the `postgres` role keeping DELETE on
  `auth.users` in the hosted project (Supabase has been narrowing what
  migrations may do in the `auth` schema), and it skips the auth server's own
  clean-up and audit log.
- **Cancelling in the action, then deleting.** That is two calls and two
  transactions. A failure between them would leave the sessions cancelled and
  the account still there, which is recoverable but is the split ADR 0008
  said to avoid. It would also miss dashboard deletions.
- **A soft delete.** It keeps the `auth.users` row, so the profile and the
  roster rows would stay. That is the opposite of the story.
