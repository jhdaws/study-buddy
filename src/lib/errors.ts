// Maps database error codes onto messages a student should actually see.
//
// TODO -- first real use: S3 (#20), mapping create_session's errors (S1,
// #18). Later: the join routine's (session full, cancelled, ended, not signed
// in), in a later sprint.
//   - map SQLSTATE codes to plain-language strings
//   - fall back to a generic message for anything unrecognised
//
// Keep this a pure function: it makes the failure paths that are awkward to
// reproduce against a live database cheap to unit test. Never surface raw
// Postgres text to a user.

export {};
