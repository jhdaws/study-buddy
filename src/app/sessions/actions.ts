"use server";

// Server actions for study sessions.
//
// TODO:
//   - createSession()  US-02  validate input, insert, redirect to the session
//   - joinSession()    US-04  take a seat
//   - leaveSession()   US-08  give up a seat
//   - cancelSession()  US-09  host only
//   - sendMessage()    US-05  post to the session chat
//
// IMPORTANT (decide during the database push): joining must not be a plain
// insert. The capacity check and the insert have to happen atomically, or two
// students can take the same last seat. Route it through a database function
// that holds a lock across both steps.

export {};
