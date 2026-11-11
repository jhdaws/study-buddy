-- P3 · Report a user (US-18). Decisions: ADR 0008 rule 10 (RLS deny by
-- default); the safety group in backlog.md (US-18, US-22, US-23).
--
-- A signed-in student can report another student -- from a session's roster,
-- so usually with that session for context -- giving a reason and an
-- optional note. Reports are for the Study Buddy team, who read them in the
-- Supabase dashboard (the `postgres` role, which RLS does not restrict). No
-- client can read, change or delete a report, its author's included: a
-- report's contents, and the fact that someone was reported, are nobody
-- else's business.
--
--   1. `report_reason`, an enum, and the `reports` table.
--   2. Grants: clients may INSERT only the four columns a student fills in.
--      reporter_id comes from its default, auth.uid(), and cannot be named --
--      so a report can never be filed in someone else's name. created_at
--      cannot be backdated. No SELECT, UPDATE, DELETE or TRUNCATE.
--   3. RLS: an INSERT policy for the caller's own reports, never about
--      themselves. No other policy.
--   4. At most 5 reports per student in any rolling 24 hours
--      (REPORTS_PER_DAY in src/lib/limits.ts) -- a trigger, refusing the
--      sixth with `report_limit_reached`, SQLSTATE PT429 (HTTP 429), like
--      SEC-03's catalogue limit. Generous for a real problem, useless for
--      spamming the team or harassing someone through the report button.
--
-- WHAT A DELETED ACCOUNT DOES TO A REPORT (US-24, ADR 0008 rule 5). The
-- report stays -- it may be the only record of something that happened --
-- with whichever side deleted their account set to null. Same for a deleted
-- session.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
--
-- REPORT_REASONS in src/lib/reports.ts gives each value its label.

create type public.report_reason as enum ('harassment', 'spam', 'safety', 'other');

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  -- Always the caller: clients have no privilege on this column, so the
  -- default is the only value it can take from them. Null only after the
  -- reporter deletes their account.
  reporter_id      uuid default auth.uid()
                   references public.profiles (id) on delete set null,
  -- Null only after the reported student deletes their account; the INSERT
  -- policy refuses a null.
  reported_user_id uuid
                   references public.profiles (id) on delete set null,
  -- The session the report was made from, for context. Optional.
  session_id       uuid
                   references public.sessions (id) on delete set null,
  reason           public.report_reason not null,
  -- Optional; the form trims it and sends a blank one as null.
  note             text,
  created_at       timestamptz not null default now(),

  -- Mirrors reportUserSchema (REPORT_NOTE_MAX_LENGTH). Counted in
  -- characters, so never stricter than the form's UTF-16 count.
  constraint reports_note_length check (
    note is null or (char_length(note) <= 500 and note ~ '[^[:space:]]')
  ),
  -- Defence in depth for the policy's rule. `<>`, not `is distinct from`: if
  -- both accounts are later deleted, both sides become null, and a check that
  -- failed on null would make the second deletion fail.
  constraint reports_not_self check (reporter_id <> reported_user_id)
);

-- The rolling-window count below, and the reporter's ON DELETE SET NULL.
create index reports_reporter_id_created_at_idx on public.reports (reporter_id, created_at);
-- How the team looks up everything about one student, and that student's
-- ON DELETE SET NULL.
create index reports_reported_user_id_idx on public.reports (reported_user_id);
create index reports_session_id_idx on public.reports (session_id);

alter table public.reports enable row level security;


-- ---------------------------------------------------------------------------
-- 2. Grants (ADR 0008 "Watch: grants"; SEC-14)
-- ---------------------------------------------------------------------------

revoke all on public.reports from anon;
revoke all on public.reports from authenticated;
grant insert (reported_user_id, session_id, reason, note)
  on public.reports to authenticated;


-- ---------------------------------------------------------------------------
-- 3. RLS -- insert only, and only as yourself, about someone else
-- ---------------------------------------------------------------------------

create policy reports_insert_own
  on public.reports
  for insert
  to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reported_user_id is not null
    and reported_user_id <> (select auth.uid())
  );

-- Deliberately no SELECT, UPDATE or DELETE policy: with RLS on and no
-- policy, those fail closed even if a grant were added by mistake.


-- ---------------------------------------------------------------------------
-- 4. At most 5 reports per student per rolling day
-- ---------------------------------------------------------------------------
--
-- In `private` with an empty search_path, like SEC-03's trigger. SECURITY
-- DEFINER because the count must see the student's earlier reports, which
-- they themselves cannot select.

create or replace function private.enforce_report_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  -- Clients cannot write created_at (no grant), but the window is measured
  -- on it, so make sure of it here too.
  new.created_at := now();

  -- Rows with no reporter come only from the team (service role, SQL);
  -- they are not counted.
  if new.reporter_id is null then
    return new;
  end if;

  -- One lock per student until the transaction ends, so two concurrent
  -- reports cannot both count the same four.
  perform pg_advisory_xact_lock(
    hashtextextended('report_limit:' || new.reporter_id::text, 0)
  );

  select count(*) into recent
  from public.reports r
  where r.reporter_id = new.reporter_id
    and r.created_at > now() - interval '1 day';

  if recent >= 5 then  -- REPORTS_PER_DAY
    raise exception 'report_limit_reached'
      using errcode = 'PT429',
            hint = 'Each student may send 5 reports a day.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_report_limit() from public;

create trigger reports_limit
  before insert on public.reports
  for each row execute function private.enforce_report_limit();
