-- A2 · Profile rules (US-01, US-01b, US-25). Decisions: docs/adr/0003 (domain
-- enforced in the database), docs/adr/0008 rules 1, 10 and 16.
--
--   1. Only @vanderbilt.edu addresses may exist in auth.users -- checked on
--      INSERT (signup) and on an UPDATE that changes the email (an email
--      change would otherwise be a way round the signup check).
--   2. Every new auth user gets a profiles row, display_name null until the
--      name step (A4).
--   3. display_name, once set, mirrors displayNameSchema (src/lib/validation.ts).
--   4. RLS: signed-in users read profiles; each updates only their own row,
--      and only its display_name. No client INSERT or DELETE.
--
-- WHY A TRIGGER, NOT THE before-user-created AUTH HOOK. Both can refuse a
-- signup. The hook returns a friendlier HTTP error, but it has to be switched
-- on separately in every environment (config.toml locally, the dashboard on
-- the hosted project) -- forget once, and the rule silently stops applying.
-- A trigger travels with the migrations and cannot be left off. Supabase's
-- docs note that an exception in a trigger on auth.users fails the signup;
-- that is the point here. The cost: Supabase Auth reports it to the caller as
-- a generic 500 "Database error saving new user", which errors.ts maps to a
-- plain message. Our own form never hits it -- signInSchema refuses other
-- domains first -- so only someone calling the auth API directly sees it.
--
-- WHERE THE FUNCTIONS LIVE. In a `private` schema, which the Data API does
-- not expose: nothing here is callable as RPC, and src/lib/database.types.ts
-- (generated from `public` and `graphql_public`) does not change.
--
-- Never edit this file once it has merged. Add a new migration instead.


create schema if not exists private;

-- Nothing in `private` is for clients. The functions below are security
-- definer, so they run as this migration's role (the schema's owner), not as
-- the auth server's role that fires the triggers -- which therefore needs no
-- grant here either.
revoke all on schema private from public;


-- ---------------------------------------------------------------------------
-- 1. Vanderbilt-only addresses
-- ---------------------------------------------------------------------------

create or replace function private.is_vanderbilt_email(email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- Case-insensitive and trimmed, the way signInSchema reads an address.
  -- Anchored at both ends, with exactly one "@" and the domain right after
  -- it, so none of these pass:
  --   x@vanderbilt.edu.evil.com  (domain only starts with vanderbilt.edu)
  --   x@notvanderbilt.edu        (domain only ends with it)
  --   x@mail.vanderbilt.edu      (subdomain -- signInSchema rejects it too)
  --   a@b@vanderbilt.edu         (two "@")
  -- A null email (phone or anonymous sign-up) is not Vanderbilt either.
  select coalesce(
    lower(btrim(email)) ~ '^[^@[:space:]]+@vanderbilt\.edu$',
    false
  );
$$;

create or replace function private.enforce_vanderbilt_email()
returns trigger
language plpgsql
-- Definer's rights only so it can call is_vanderbilt_email in `private`; it
-- reads nothing but the row it is given.
security definer
set search_path = ''
as $$
begin
  if not private.is_vanderbilt_email(new.email) then
    -- The constraint name is in the message too, quoted the way Postgres
    -- quotes a real CHECK's: PostgREST passes on the message but not the
    -- separate constraint field, and src/lib/errors.ts matches on it.
    raise exception 'new row for relation "users" violates constraint "auth_users_vanderbilt_email": only @vanderbilt.edu email addresses can sign up'
      using errcode = 'check_violation',
            constraint = 'auth_users_vanderbilt_email';
  end if;
  return new;
end;
$$;

create trigger enforce_vanderbilt_email_on_signup
  before insert on auth.users
  for each row execute function private.enforce_vanderbilt_email();

-- Only when the address actually changes: Supabase Auth may write the email
-- column back unchanged on unrelated updates, and an account that predates
-- this migration must still be able to sign in.
create trigger enforce_vanderbilt_email_on_change
  before update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function private.enforce_vanderbilt_email();


-- ---------------------------------------------------------------------------
-- 2. A profile row for every new user
-- ---------------------------------------------------------------------------

create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
-- Definer's rights: it runs as the auth server's role, which has no grant on
-- public.profiles, and inserts a row no RLS policy allows.
security definer
set search_path = ''
as $$
begin
  -- No email copied across (ADR 0008 rule 16). Name comes at the name step.
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger create_profile_on_signup
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

-- Trigger functions cannot be called directly anyway; this one can.
revoke all on function private.is_vanderbilt_email(text) from public;

-- Accounts created before this migration (team test accounts on the hosted
-- project, say) get a profile too, or the name step would have no row to
-- update. Harmless where there are none.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- 3. display_name mirrors displayNameSchema
-- ---------------------------------------------------------------------------
--
-- The schema trims, then requires 1..DISPLAY_NAME_MAX_LENGTH (50)
-- characters, and saveDisplayName stores the trimmed value. So a stored name
-- must be non-empty, at most 50 characters, and already trimmed: no leading
-- or trailing whitespace. "Whitespace" is JavaScript's String.prototype.trim
-- set -- [:space:] plus the Unicode spaces listed -- so a name of only tabs or
-- no-break spaces fails here exactly as it fails the form.
--
-- One deliberate difference: JavaScript counts UTF-16 units, Postgres counts
-- characters, so a name with emoji may be slightly longer here than the form
-- allows. That only makes the database more lenient than the form, never the
-- reverse -- the form can never send a name the database refuses.
--
-- Null stays allowed: it means "no name yet" (ADR 0008 rule 1).

alter table public.profiles
  add constraint profiles_display_name_check check (
    display_name is null
    or (
      char_length(display_name) between 1 and 50
      and display_name !~ '^[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]'
      and display_name !~ '[[:space:]\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$'
    )
  );


-- ---------------------------------------------------------------------------
-- 4. Who may read and write profiles
-- ---------------------------------------------------------------------------
--
-- Grants first. Supabase grants anon and authenticated every privilege on a
-- new table and leaves RLS to restrict rows (ADR 0008, "Watch: grants"). RLS
-- cannot restrict COLUMNS, though, so an update policy alone would let a user
-- rewrite their own id or created_at. Hence: no table-wide write privileges
-- for clients at all, and UPDATE on display_name only.

revoke all on public.profiles from anon;
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Display names are shown to every signed-in student (hosts, rosters). There
-- is nothing else in the row worth hiding: email is not here (ADR 0008
-- rule 16), which is what US-25 needs.
create policy "Signed-in users can read profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy (the signup trigger creates rows) and no DELETE policy
-- (deleting the auth user cascades, US-24).
