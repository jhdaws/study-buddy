-- A2 · Profile rules (US-01, US-25). Decisions: docs/adr/0003-authentication.md
--
-- Adds to the `profiles` table W2 created: the two signup triggers, the
-- display_name CHECK, and the RLS policies. Structure is W2's; rules are here.
--
-- ADR 0003 restricts sign-in to @vanderbilt.edu addresses and names THIS FILE
-- as the only place that enforcement actually happens. signInSchema
-- (src/lib/validation.ts) and signIn() (src/app/login/actions.ts) check the
-- domain too, but only so the student gets a specific message: both are
-- skipped entirely by anyone calling the Supabase auth API directly with
-- their own key. The trigger below is not skippable, which is what US-01b
-- asks for.
--
-- Email is still not copied into `profiles` (W2's comment, ADR 0008 rule 16).
-- It stays in auth.users, which clients cannot read, so US-25 holds without
-- column grants. The read policy below exposes display names, nothing else.


-- ---------------------------------------------------------------------------
-- Vanderbilt-only signups (US-01, US-01b)
--
-- `before insert` so the row never reaches the table. GoTrue surfaces the
-- raised exception as a failed signup; signIn() maps it to a readable message
-- rather than passing the SQLSTATE on.
--
-- The domain is taken as everything after the LAST "@", matching domainOf()
-- in src/lib/validation.ts. A subdomain (@mail.vanderbilt.edu) is rejected by
-- both, deliberately: the schema compares the domain exactly, so accepting
-- subdomains here would make the database more permissive than the form.
--
-- security definer with an empty search_path: the function is reached through
-- a trigger owned by this migration, and every name it uses is qualified, so
-- it cannot be captured by a search_path a caller controls.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_vanderbilt_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null
     or lower(substring(new.email from '[^@]*$')) <> 'vanderbilt.edu' then
    raise exception 'Only @vanderbilt.edu email addresses can sign up.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger enforce_vanderbilt_email
  before insert on auth.users
  for each row
  execute function public.enforce_vanderbilt_email();


-- ---------------------------------------------------------------------------
-- A profile row per signup (ADR 0008 rule 1)
--
-- display_name is left null on purpose: the row exists from signup, and A4's
-- name step fills it in before the user can do anything else. S1's
-- create_session refuses a session from a profile that still has no name.
--
-- `after insert`, so it only runs for a row that survived the domain check
-- above. security definer because the inserting role is GoTrue's
-- supabase_auth_admin, which has no rights on public.profiles -- and because
-- there is deliberately no INSERT policy for anyone else (see below).
--
-- on conflict do nothing: a signup for an id that already has a profile is
-- not a reason to fail the signup.
-- ---------------------------------------------------------------------------

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger create_profile_for_new_user
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();


-- ---------------------------------------------------------------------------
-- display_name length (mirrors displayNameSchema)
--
-- 1..50 characters after trimming -- DISPLAY_NAME_MAX_LENGTH in
-- src/lib/limits.ts. Change one and you must change the other.
--
-- NULL stays legal: that is the state between signup and the name step. What
-- this refuses is a name that is present but empty or whitespace-only, which
-- would otherwise pass as "set" and render as a blank host.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add constraint profiles_display_name_length
  check (
    display_name is null
    or char_length(btrim(display_name)) between 1 and 50
  );


-- ---------------------------------------------------------------------------
-- RLS (ADR 0008 rule 10)
--
-- Two policies, both for `authenticated` only. `anon` gets nothing: a
-- signed-out visitor cannot read display names at all.
--
-- No INSERT policy -- rows come from the signup trigger above, which runs as
-- definer and is not subject to RLS. No DELETE policy -- a profile goes away
-- when its auth.users row does, through W2's on delete cascade. Both omissions
-- are deliberate: a missing policy fails closed.
-- ---------------------------------------------------------------------------

-- Reading any profile is reading a display name, which is exactly what the
-- session list needs for `hostDisplayName` (S4).
create policy "Signed-in users can read display names"
  on public.profiles
  for select
  to authenticated
  using (true);

-- `using` picks the row to update; `with check` validates the row afterwards.
-- Both are needed: `using` alone would let a user move their own row's id to
-- someone else's, and `with check` alone would let them edit any row as long
-- as they left the id alone.
create policy "Users can update only their own profile"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
