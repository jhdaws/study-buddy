-- P5 · US-18, second half: report an inappropriate chat message (#156).
-- The first half, reporting a user from the roster, is *_reports.sql (#132);
-- a message report is a row in the same `reports` table, so the team reads
-- every report in one place and the same rules hold:
--
--   * Insert only. No client reads, changes or deletes a report, its author's
--     included (no SELECT/UPDATE/DELETE grant or policy, unchanged).
--   * reporter_id is always the caller (its default, auth.uid()).
--   * Never about yourself (reports_insert_own, unchanged), so nobody can
--     report their own message.
--   * At most 5 reports a day, user and message reports together -- the
--     existing reports_limit trigger counts every row (REPORTS_PER_DAY).
--
-- What this adds:
--
--   1. `reports.message_id`, the message being reported.
--   2. An INSERT grant on that one extra column.
--   3. A RESTRICTIVE policy: a report naming a message must name the
--      message's real author as reported_user_id and its real session as
--      session_id -- and the message must be one the caller can read. The
--      check runs as the caller, so session_messages' own SELECT policy
--      applies: only someone on that session's roster can report its chat.
--      A report cannot pin a message on someone who did not write it.
--   4. One report per student per message, so a double tap or a second tab
--      is refused with a clear message instead of using up the day's limit.
--
-- WHAT A DELETED ACCOUNT OR SESSION DOES. Unchanged from *_reports.sql: the
-- report stays, with the deleted side set to null. Messages are never edited
-- or deleted by clients (*_session_chat.sql), so the message a report points
-- at is the one that was reported; only deleting the whole session (the team
-- only) takes it away, and then message_id becomes null too.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table public.reports
  add column message_id uuid
    references public.session_messages (id) on delete set null;

-- How the team finds every report about one message, and the ON DELETE SET
-- NULL when a session's chat is deleted with it.
create index reports_message_id_idx on public.reports (message_id);


-- ---------------------------------------------------------------------------
-- 2. Grant (SEC-14: name the columns)
-- ---------------------------------------------------------------------------

grant insert (message_id) on public.reports to authenticated;


-- ---------------------------------------------------------------------------
-- 3. A message report must be about that message's author, in its session
-- ---------------------------------------------------------------------------
--
-- RESTRICTIVE, so it is ANDed with reports_insert_own rather than offering a
-- second way in. A report with no message passes it untouched.

create policy reports_insert_message_seen
  on public.reports
  as restrictive
  for insert
  to authenticated
  with check (
    message_id is null
    or exists (
      select 1
      from public.session_messages m
      where m.id = reports.message_id
        and m.author_id = reports.reported_user_id
        and m.session_id = reports.session_id
    )
  );


-- ---------------------------------------------------------------------------
-- 4. One report per student per message
-- ---------------------------------------------------------------------------
--
-- Named, so src/lib/errors.ts can map it ("You've already reported this
-- message."). A partial index: user reports (no message) are not limited
-- this way, and a reporter who deleted their account (null) never collides.

create unique index reports_reporter_message_key
  on public.reports (reporter_id, message_id)
  where message_id is not null;
