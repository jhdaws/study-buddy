-- SEC-03 (threat model T5): a cap on how many departments and courses one
-- student can add.
--
-- S2's INSERT policies check only `created_by = auth.uid()`, so any signed-in
-- student could script `POST /rest/v1/departments` (or courses) and fill the
-- shared picker with junk, as fast as PostgREST answers. The policies are
-- right about *who*; nothing said *how many*.
--
-- The rule: per student, per table, at most 10 new rows in any rolling hour
-- and 30 in any rolling day. Far above normal use -- a student adds a handful
-- of courses a semester -- and low enough that a script gets nowhere.
-- Mirrored in src/lib/limits.ts (CATALOGUE_INSERTS_PER_HOUR / _PER_DAY), which
-- only words the error message: this trigger is the enforcement, because a
-- direct PostgREST insert never passes through our server.
--
-- How it fits the existing paths:
--   - Direct inserts (PostgREST) and get_or_create_course() (SECURITY
--     INVOKER, S2) both insert as the caller, with created_by = auth.uid(),
--     so one BEFORE INSERT trigger covers both. It counts by the row's
--     created_by, never by the role running the statement.
--   - get_or_create_course() inserts with ON CONFLICT DO NOTHING, and BEFORE
--     INSERT triggers fire *before* the conflict check. So a row that already
--     exists is let through uncounted: it adds nothing (DO NOTHING, or a
--     unique violation), and a student at the limit can still pick an
--     existing course.
--   - Rows with no creator (the seed; the service role) are not counted.
--
-- Refused with `catalogue_limit_reached`, SQLSTATE PT429: PostgREST answers a
-- PTxyz code with HTTP xyz, so a script gets a real 429. src/lib/errors.ts maps
-- the message.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- Indexes for the count below (and for profiles' ON DELETE SET NULL, which
-- looks rows up by created_by too).
-- ---------------------------------------------------------------------------

create index departments_created_by_created_at_idx
  on public.departments (created_by, created_at);

create index courses_created_by_created_at_idx
  on public.courses (created_by, created_at);


-- ---------------------------------------------------------------------------
-- The trigger function. In `private` (not exposed by the Data API, see
-- *_profile_rules.sql). SECURITY DEFINER so the count sees every row the
-- student created whatever the SELECT policies later hide; search_path is
-- empty, so every name below is schema-qualified.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_catalogue_insert_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  added_last_hour integer;
  added_last_day integer;
begin
  if new.created_by is null then
    return new;
  end if;

  -- The window is measured on created_at, so a caller must not be able to
  -- backdate a row out of it: `created_at` is in the insert's column list for
  -- anyone with INSERT on the table.
  new.created_at := now();

  -- Already there: this insert adds no row, so it costs nothing.
  if tg_table_name = 'departments' then
    if exists (select 1 from public.departments d where d.code = new.code) then
      return new;
    end if;
  elsif exists (
    select 1 from public.courses c
    where c.department_code = new.department_code and c.number = new.number
  ) then
    return new;
  end if;

  -- One lock per student, held until the transaction ends. Without it two
  -- concurrent inserts by the same student each count the same 9 rows (neither
  -- sees the other's uncommitted row) and both get in.
  perform pg_advisory_xact_lock(
    hashtextextended('catalogue_insert_limit:' || new.created_by::text, 0)
  );

  if tg_table_name = 'departments' then
    select count(*) filter (where d.created_at > now() - interval '1 hour'),
           count(*)
      into added_last_hour, added_last_day
      from public.departments d
     where d.created_by = new.created_by
       and d.created_at > now() - interval '1 day';
  else
    select count(*) filter (where c.created_at > now() - interval '1 hour'),
           count(*)
      into added_last_hour, added_last_day
      from public.courses c
     where c.created_by = new.created_by
       and c.created_at > now() - interval '1 day';
  end if;

  if added_last_hour >= 10      -- CATALOGUE_INSERTS_PER_HOUR
     or added_last_day >= 30    -- CATALOGUE_INSERTS_PER_DAY
  then
    raise exception 'catalogue_limit_reached'
      using errcode = 'PT429',
            detail = format(
              '%s: %s added in the last hour, %s in the last day',
              tg_table_name, added_last_hour, added_last_day
            ),
            hint = 'Each student may add 10 an hour and 30 a day.';
  end if;

  return new;
end;
$$;

-- Trigger functions cannot be called directly, but say so in the grants too.
revoke all on function private.enforce_catalogue_insert_limit() from public;

create trigger departments_insert_limit
  before insert on public.departments
  for each row execute function private.enforce_catalogue_insert_limit();

create trigger courses_insert_limit
  before insert on public.courses
  for each row execute function private.enforce_catalogue_insert_limit();
