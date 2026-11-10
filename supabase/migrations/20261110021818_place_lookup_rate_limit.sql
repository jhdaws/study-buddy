-- SEC-05 (threat model T8): a per-student limit on place lookups.
--
-- createSession() calls resolvePlace() before anything is saved, and each
-- real place id costs one billed Google Place Details call. A signed-in
-- student submitting the form in a loop had only Google's daily quota cap
-- between them and our bill. createSession() now spends one hit of the
-- `place_lookup` bucket here first, and does not look anything up if refused.
--
-- The rule: at most 20 hits in any rolling 10 minutes, per student. A host
-- trying a few places before one is accepted spends a handful. Mirrored in
-- src/lib/limits.ts (PLACE_LOOKUPS_PER_WINDOW, PLACE_LOOKUP_WINDOW_MINUTES).
--
-- consume_rate_limit(p_bucket) is general, but trusts its caller with nothing
-- except the bucket's name:
--   - who: auth.uid(), from the caller's own JWT. There is no user argument.
--   - how many, how long: private.rate_limit_rules, never arguments. A student
--     calling the RPC directly can only spend their own budget faster.
--   - which bucket: only one with a rule. An unknown name is refused, so the
--     table cannot be grown with made-up buckets (SEC-03's problem again).
-- Refused with `<bucket>_rate_limited`, SQLSTATE PT429 (PostgREST answers
-- HTTP 429); src/lib/errors.ts maps the message. A refusal adds no hit, and
-- each call deletes the caller's expired hits, so the table holds at most
-- max_hits rows per student and bucket.
--
-- Never edit this file once it has merged. Add a new migration instead.


-- ---------------------------------------------------------------------------
-- Tables, in `private` (*_profile_rules.sql): the Data API does not expose the
-- schema and clients have no USAGE on it. RLS on with no policies, and no
-- grants, in case either of those ever changes. consume_rate_limit() is the
-- only way in; it runs as the owner, which RLS does not restrict.
-- ---------------------------------------------------------------------------

create table private.rate_limit_rules (
  bucket         text primary key,
  max_hits       integer not null check (max_hits > 0),
  window_seconds integer not null check (window_seconds > 0)
);

create table private.rate_limit_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket  text not null references private.rate_limit_rules (bucket) on delete cascade,
  hit_at  timestamptz not null default now()
);

create index rate_limit_hits_user_bucket_hit_at_idx
  on private.rate_limit_hits (user_id, bucket, hit_at);

alter table private.rate_limit_rules enable row level security;
alter table private.rate_limit_hits enable row level security;

revoke all on private.rate_limit_rules, private.rate_limit_hits
  from public, anon, authenticated;

insert into private.rate_limit_rules (bucket, max_hits, window_seconds)
values ('place_lookup', 20, 600);  -- PLACE_LOOKUPS_PER_WINDOW, PLACE_LOOKUP_WINDOW_MINUTES


-- ---------------------------------------------------------------------------
-- consume_rate_limit -- spend one hit, or raise. Returns how many hits the
-- caller has left in the window after this one.
-- ---------------------------------------------------------------------------

-- Prefixed parameter: an unprefixed `bucket` would collide with the column
-- of the same name (BUG-03, BUG-14).
create or replace function public.consume_rate_limit(p_bucket text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  allowed_hits integer;
  window_length interval;
  recent_hits integer;
begin
  if caller is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  select r.max_hits, make_interval(secs => r.window_seconds)
    into allowed_hits, window_length
    from private.rate_limit_rules r
   where r.bucket = p_bucket;
  if not found then
    raise exception 'unknown_rate_limit' using errcode = '22023';
  end if;

  -- One call per student and bucket at a time, until the transaction ends.
  -- Without it, two concurrent calls each count 19 and both get in.
  perform pg_advisory_xact_lock(
    hashtextextended('rate_limit:' || p_bucket || ':' || caller::text, 0)
  );

  delete from private.rate_limit_hits h
   where h.user_id = caller
     and h.bucket = p_bucket
     and h.hit_at <= now() - window_length;

  select count(*) into recent_hits
    from private.rate_limit_hits h
   where h.user_id = caller and h.bucket = p_bucket;

  if recent_hits >= allowed_hits then
    raise exception using
      message = p_bucket || '_rate_limited',
      errcode = 'PT429',
      detail = format('%s of %s hits used in the last %s', recent_hits, allowed_hits, window_length);
  end if;

  insert into private.rate_limit_hits (user_id, bucket) values (caller, p_bucket);
  return allowed_hits - recent_hits - 1;
end;
$$;

-- `revoke ... from public` does not remove what Supabase's default
-- privileges grant `anon` directly (BUG-08), so revoke that too. Signed-in
-- students need EXECUTE: createSession() calls this with their own JWT, which
-- is what makes auth.uid() theirs.
revoke all on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;
