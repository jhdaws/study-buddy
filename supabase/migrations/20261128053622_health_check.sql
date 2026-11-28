-- V5 · #151: a database round trip for /api/health.
--
-- /api/health has to say whether the database answers. It runs without a
-- signed-in user, and since SEC-14 the anon role can read no table at all,
-- so there is nothing it could select. The secret-key client could, but
-- admin.ts allows it exactly two jobs (ADR 0008 rule 12, ADR 0010) and a
-- health check is not worth a third.
--
-- So: one function that reads nothing and returns true. Calling it through
-- the Data API proves the whole path the app depends on -- PostgREST is up,
-- Postgres accepts a connection and runs a query -- without exposing a row.
--
--   * SECURITY INVOKER, and it touches no table: running it as anon grants
--     anon nothing new.
--   * STABLE, so PostgREST allows it on a GET as well as a POST.
--   * An empty search_path, as for every function here (it names nothing
--     anyway).
--
-- Never edit this file once it has merged. Add a new migration instead.

create function public.health_check()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true
$$;

comment on function public.health_check() is
  'V5 (#151): /api/health calls this to prove the database answers. Reads nothing.';

-- New functions are executable by PUBLIC by default. Say exactly who may
-- call this one: the signed-out health check (anon) and, harmlessly, a
-- signed-in client.
revoke all on function public.health_check() from public;
grant execute on function public.health_check() to anon, authenticated;
