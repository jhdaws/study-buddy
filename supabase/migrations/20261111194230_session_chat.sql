-- C1 · Session chat (US-05, US-05b). Decisions: ADR 0008 rules 4 and 5,
-- rule 10 (RLS deny by default); the live roster's Realtime rules
-- (*_live_roster.sql).
--
-- Everyone on a session's roster -- the host included -- can read its chat
-- and post to it. Nobody else can: not a student who has not joined, not one
-- who has left, not a signed-out visitor. That is enforced here, so a direct
-- Data API call or a hand-made Realtime subscription gets exactly what the
-- page shows, which for a non-attendee is nothing (US-05b).
--
--   1. The `session_messages` table.
--   2. Grants: clients may SELECT, and INSERT only (session_id, body).
--      author_id comes from its default, auth.uid(), and cannot be named --
--      so a message can never be posted in someone else's name -- and
--      created_at cannot be backdated. No UPDATE or DELETE: a message, once
--      sent, is part of the record (and what a report, US-18, would point at).
--   3. RLS: read while on the roster; post while on the roster and the chat
--      is open. "Open" is ADR 0008 rule 4: the session is not cancelled and
--      ended less than a week ago (CHAT_OPEN_DAYS_AFTER_END in
--      src/lib/limits.ts). After that it is read-only, for ever.
--   4. Realtime: the table joins the supabase_realtime publication, so the
--      session page hears of a new message while it is open.
--
-- WHAT A DELETED ACCOUNT DOES TO A MESSAGE (US-24, ADR 0008 rule 5). The
-- message stays -- the conversation belongs to everyone in it -- with
-- author_id set to null, shown as "Deleted user". A deleted session takes its
-- chat with it (only the team can delete a session).
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table public.session_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null
             references public.sessions (id) on delete cascade,
  -- Always the sender: clients have no privilege on this column, so the
  -- default is the only value it can take from them. Null only after the
  -- sender deletes their account.
  author_id  uuid default auth.uid()
             references public.profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),

  -- Mirrors chatMessageSchema (CHAT_MESSAGE_MAX_LENGTH): 1 to 1000
  -- characters, with no whitespace at either end -- the form trims, so
  -- blank or padded text means a client skipped it. The same whitespace
  -- class as A2's display name, which is what JavaScript's trim() removes.
  -- Counted in characters, so never stricter than the form's UTF-16 count.
  constraint session_messages_body_check check (
    char_length(body) between 1 and 1000
    and body !~ '^[[:space:]   -     　﻿]'
    and body !~ '[[:space:]   -     　﻿]$'
  )
);

-- The transcript, oldest first, for one session -- and the cascade when a
-- session is deleted.
create index session_messages_session_id_created_at_idx
  on public.session_messages (session_id, created_at);
-- The author's ON DELETE SET NULL.
create index session_messages_author_id_idx on public.session_messages (author_id);

alter table public.session_messages enable row level security;


-- ---------------------------------------------------------------------------
-- 2. Grants (ADR 0008 "Watch: grants"; SEC-14)
-- ---------------------------------------------------------------------------
--
-- Revoking anon matters beyond the Data API: Realtime does not apply RLS to
-- DELETE events (a cascade from a deleted session), and checks these
-- privileges instead -- see *_live_roster.sql. Signed out, nothing reads
-- this table.

revoke all on public.session_messages from anon;
revoke all on public.session_messages from authenticated;
grant select on public.session_messages to authenticated;
grant insert (session_id, body) on public.session_messages to authenticated;


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
--
-- Both policies read session_attendees and sessions as the caller, which S1's
-- select policies allow any signed-in student. Realtime evaluates the SELECT
-- policy as each subscriber for each new message, so a non-attendee's
-- subscription is sent nothing.

create policy session_messages_select_attendees
  on public.session_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_attendees a
      where a.session_id = session_messages.session_id
        and a.user_id = (select auth.uid())
    )
  );

create policy session_messages_insert_attendees
  on public.session_messages
  for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.session_attendees a
      where a.session_id = session_messages.session_id
        and a.user_id = (select auth.uid())
    )
    and exists (
      select 1
      from public.sessions s
      where s.id = session_messages.session_id
        and s.status = 'open'
        and s.ends_at > now() - interval '7 days'  -- CHAT_OPEN_DAYS_AFTER_END
    )
  );

-- Deliberately no UPDATE or DELETE policy: with RLS on and no policy, those
-- fail closed even if a grant were added by mistake.


-- ---------------------------------------------------------------------------
-- 4. Realtime
-- ---------------------------------------------------------------------------
--
-- INSERT events are checked against session_messages_select_attendees as
-- each subscriber. The replica identity stays the default (the primary key),
-- so a DELETE event -- only ever a cascade -- carries a message id and
-- nothing else, and not even that to a signed-out listener (the revoke
-- above). Guarded like *_live_roster.sql.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_messages'
  ) then
    alter publication supabase_realtime add table public.session_messages;
  end if;
end;
$$;
