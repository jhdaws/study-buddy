-- P2 · Delete my account (US-24). Decisions: ADR 0008 rule 5 and "What
-- happens on delete"; ADR 0010 (the secret key deletes the auth user).
--
-- Deleting an account is a hard delete of the auth.users row, made by
-- deleteAccount() (src/app/account/actions.ts) through Supabase Auth's admin
-- API. W2's foreign keys do the rest: the profile goes (cascade), the
-- student's roster rows go and free their seats (cascade), and sessions they
-- hosted, and courses and departments they created, keep their rows with the
-- reference set to null ("Deleted user").
--
-- What no foreign key can do, ADR 0008 says, is CANCEL the student's
-- upcoming hosted sessions: `on delete set null` would leave them open with
-- nobody running them, and attendees would walk to a session no one hosts.
-- This migration adds that step as a BEFORE DELETE trigger on profiles, so
-- it runs inside the same statement -- the same transaction -- as the
-- cascade from auth.users, however the account is deleted: our action, the
-- Supabase dashboard, or SQL. If the cancel fails, the delete fails; there is
-- no window where the account is gone and its sessions are still open.
--
-- "Upcoming" is ADR 0008's "not ended": ends_at in the future, including a
-- session already in progress. Ended sessions are history and are left as
-- they are; cancelled ones already are.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- In `private` (not exposed by the Data API, like A2's trigger functions).
-- SECURITY DEFINER: the delete arrives from Supabase Auth's own role, which
-- has no privileges on public.sessions, and there is deliberately no UPDATE
-- policy on sessions for anyone. Empty search_path, every name qualified.

create or replace function private.cancel_hosted_sessions_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions s
     set status = 'cancelled'
   where s.host_id = old.id
     and s.status = 'open'
     and s.ends_at > now();
  return old;
end;
$$;

revoke all on function private.cancel_hosted_sessions_on_profile_delete() from public;

create trigger cancel_hosted_sessions_on_delete
  before delete on public.profiles
  for each row execute function private.cancel_hosted_sessions_on_profile_delete();
