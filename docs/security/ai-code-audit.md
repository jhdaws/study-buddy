# AI-code audit -- Study Buddy   (docs/security/ai-code-audit.md)

Sprint 4 Part 2c · 2026-11-09 · main @ `a578559`

**Reviewer.** Claude Code, at the team's request. **No team member has verified this yet.** Treat
the verdicts as claims to check, not settled results. The AI usage row is in the PR that adds
this file, and stays `⬜ pending` until someone has read the code against it.

## Which files, and why these two

`docs/ai-usage-log.md` attributes most of the security-relevant code to AI sessions. The two
files below handle the most input, auth, data access and secrets, and the AI wrote them across
the most sessions:

| File | Lines | Handles | AI log rows that wrote or rewrote it |
|------|------:|---------|--------------------------------------|
| `src/app/login/actions.ts` | 350 | **Input and auth.** Every sign-in, sign-up, code, password and sign-out action, each a public POST endpoint. | 2026-09-29 (first version), 10-11 (#42 review fixes), 10-12 (code-only email, demo account), 10-18 (test login), 10-19 (A6 passwords) |
| `src/lib/places.ts` | 281 | **Secrets and data access.** The server Maps key, the Supabase secret key that bypasses RLS, untrusted place ids, and a call to a billed external API. | 2026-09-29 (stub), 09-30 (M3: the real implementation), 10-08 (comments) |

Considered and not picked:
- `src/app/sessions/actions.ts` and the migrations: their access control is enforced in the
  database, and `tests/db/` (now including `idor.test.ts`) tests it.
- `src/lib/supabase/server.ts`: small, and both files below depend on it, so it was read with
  them.
- `src/app/auth/confirm/route.ts`: its one risk, the open redirect, is handled by
  `safe-next.ts`, which is unit tested.

Method: every line read, top to bottom. Verdicts:
- **Right**: correct, and I checked it.
- **Right, but depends on X**: correct only if something outside the file holds.
- **Wrong**: a defect.
- **Stale**: true when written, false now.

Finding IDs refer to `findings.md`.

---

## 1. `src/app/login/actions.ts`

### Line by line

| Lines | What it does | Verdict |
|-------|--------------|---------|
| 1-18 | `"use server"`. The header says every action is a public POST endpoint and validates inside itself. Lines 16-18 say the database trigger is "the authoritative check", so "calling the Supabase auth API directly cannot bypass it". | **Wrong by omission.** The trigger checks that an address *ends in* `@vanderbilt.edu`. It cannot check that the caller *owns* that mailbox. Ownership is enforced only by the hosted "Confirm email" setting, which this file never mentions, and which the `config.toml` the AI worked against has **off**. Locally, the sign-up API created confirmed accounts for addresses nobody owned (SEC-11). |
| 20-60 | Imports. Errors come only from `@/lib/errors`, redirects only through `@/lib/safe-next`, and validation from `@/lib/validation`. | Right. It follows CLAUDE.md's rules on errors and validation. |
| 62-87 | Return types. `values` "never carries the password back". | Right: enforced by 200, 207 and 247 through `withoutPasswords()` (262-269). |
| 107-115 | `signIn()`: zod-parses the form before anything else. | Right. |
| 117-124 | Builds `emailRedirectTo` from request headers (`requestOrigin()`), and `next` from `safeNextPath()`. | **Right, but depends on the dashboard.** The headers can be forged by a non-browser caller. `request-origin.ts:16-19` correctly says Supabase replaces any redirect not on its allowlist. That allowlist is a dashboard setting (README step 1), and the README's warning against a `*-jdaws.vercel.app` wildcard is the reason this stays safe. |
| 126-130 | `signInWithOtp({ shouldCreateUser: true })`. | Right for the product. It means anyone can make the app email any Vanderbilt address, limited only by Supabase's throttles (SEC-04). |
| 131-134 | Same reply whether or not the address has an account. | Right: no enumeration through the app. |
| 154-162 | `verifyCode()` re-validates the hidden `email` field ("as forgeable as any other"). | Right. |
| 164-168 | `verifyOtp({ type: "email" })`; any error gets one generic message. | **Right, but under-assessed.** It relies entirely on Supabase to limit guesses. Locally, 40 wrong guesses got no `429`, and the real code still worked afterwards. Nothing limits guesses per code (SEC-12). |
| 170-175 | A code sign-in always goes on to the password step (`choosePassword: true`). `redirect()` sits outside any `try`. | Right as a flow, but A6 changed the code's role without re-assessing it. Since A6, a guessed code is a password reset, so it is a full account takeover. The code is still 6 digits valid for an hour, chosen in 10-12 when it was only a convenience. |
| 194-208 | `signInWithPassword()`: one message for an unknown address and a wrong password; only `email` comes back. | Right. **Missing:** a failed sign-in is not logged anywhere (SEC-09). |
| 210-216 | Sets the `has_password` flag in `user_metadata` after a password sign-in. | Right. That metadata is writable by the user, and `server.ts:102-108` says correctly that it only decides whether the app *asks*. It is never a check. |
| 218 | `redirect(await pathAfterSignIn(…))`. | Right. `next` goes through `safeNext()`. |
| 236-243 | `setPassword()` uses `getCurrentUser()`, not `requireUser()`, so the step it is part of isn't redirected away. | Right. |
| 245-257 | Validates, then `updateUser({ password })` with only the session as proof. | **Wrong reasoning.** There is no re-authentication, and README step 7 (written in the same A6 session) justifies `secure_password_change = false` with "the app only asks for a password straight after a code anyway". But `/login/password` and this action accept **any** signed-in session at any time. A session left open on a shared machine, US-21's own case, can change the password. That also signs the owner out everywhere else (GoTrue revokes other sessions; seen locally). SEC-15. |
| 259 | `redirect(safeNext(…))`. | Right. |
| 263-269 | `withoutPasswords()` strips `password` and `confirmPassword`. | Right. |
| 298-310 | `saveDisplayName()`: `getCurrentUser()`, then zod. | Right. |
| 312-323 | Updates *your own* profile through *your own* client (RLS plus a column grant), and treats zero rows as an error. | Right. `tests/db/idor.test.ts` shows the same statement aimed at another user's id changes nothing. |
| 325-326 | `revalidatePath("/", "layout")`, then a redirect to the password step or `next`. | Right (BUG-11's fix). |
| 346-350 | `signOut({ scope: "local" })`, ignoring any error. | Right for US-21: the cookies are cleared even if Supabase can't be reached. |

### What the AI got wrong

1. **It reasoned about the email *domain*, never about *who controls the mailbox* (SEC-11, Critical
   until verified).** The file's own security argument (lines 16-18) is the domain trigger. The
   setting that stops a stranger signing up as `anyone@vanderbilt.edu` lives only in a dashboard.
   - The AI-written README says to leave it on, but nothing checks it.
   - The local `config.toml` has it off, so the unit, db and e2e suites all run against the
     *unsafe* value.
2. **When A6 made the emailed code a way to reset a password, it didn't re-assess the code
   (SEC-12).** The length, expiry and attempt limit were picked when the code was only a sign-in
   convenience. They are now the strength of every account's recovery path.
3. **The documented reason for skipping re-authentication is false about the code it describes
   (SEC-15).** "The app only asks straight after a code" describes when the app *offers* the
   page, not what the page and action *accept*.
4. **No audit trail for authentication (SEC-09).** The same AI logged carefully in `places.ts`
   and the sessions actions. The login actions, where failed attempts matter most, log nothing.

What it got right:
- `getUser()` everywhere, never `getSession()`.
- No enumeration anywhere in the app's own messages.
- Passwords never echoed back.
- Every redirect through `safeNextPath()`.
- `redirect()` kept outside `try`.
- Each forgeable input (the Host header, the hidden email) named in a comment, along with what
  makes it safe.

### The prompt change that would have prevented it

The A6 prompt asked for email + password sign-in. Adding these four lines, the first in
CLAUDE.md for any auth work, would have caught all four problems above:

> 1. **List every security property this flow relies on that is set outside the repository**
>    (Supabase dashboard, Vercel, GitHub settings). For each one, either put the production value
>    in `supabase/config.toml` so a reviewer can see it, or add it to a "verify before merge"
>    list in the PR. Never write down a setting's value you haven't seen.
> 2. **For every credential this change creates or repurposes** (a code that now resets a
>    password), state its entropy, lifetime and attempt limit, and what guessing it gets an
>    attacker.
> 3. **For every state-changing account action, say whether it requires recent
>    authentication**, and test the claim against what the route *accepts*, not when the UI
>    shows it.
> 4. **Log every failed authentication attempt** (no passwords, codes or tokens), as the other
>    actions already log failures.

---

## 2. `src/lib/places.ts`

### Line by line

| Lines | What it does | Verdict |
|-------|--------------|---------|
| 1-15 | Header: server-only. The secret key may be used only to write `locations`, and every rule lives in pure, tested modules. | Right. A production build's client bundles contain none of `SUPABASE_SECRET_KEY`, `GOOGLE_MAPS_SERVER_API_KEY`, `sb_secret_`, `service_role` or `createAdminClient` (checked in 2c). |
| 17 | `import "server-only"`. | Right: importing this from a Client Component fails the build. |
| 19-32 | Imports: env readers, fixtures, policy helpers, the admin client, `getCurrentUser`. | Right. |
| 34-67 | `PlaceError`, with fixed student-safe messages per reason. | Right: neither Google's nor Postgres's text can reach a student. |
| 69-98 | Comment, steps 1-6: untrusted id, shape check, signed-in check, Place Details, `judgePlace()`, an upsert with Google's coordinates, never the client's. Missing configuration fails loudly. | Right. It matches the code below. |
| 99-112 | Comment: fixture ids are allowed outside production or without a server key, and are safe because they "are not rows in any real database -- they are not seeded". | **Stale.** M5 (#74, 2026-10-18) now seeds them into local databases (`scripts/seed-local-locations.mts`). Production is still unseeded; I didn't check. The safety argument now depends on which database it is (SEC-17). |
| 114-121 | Comment: the signed-in check exists because `createSession()`'s `requireUser()` "is a stub returning FIXTURE_USER until A4 (#17)". "Until A4 lets anyone sign in, that closes the real path in production entirely." | **Stale, about security.** A4 replaced the stub (`supabase/server.ts:152`), and anyone with a Vanderbilt account can sign in. The *check* is still right to keep, but a reviewer reading this would think the billed path is closed in production. It is closed only because there's no server key yet (SEC-17). |
| 122-124 | "NOT done yet: per-user rate limiting." | **Right to say so, but it should have become a ticket.** The gap stayed in a comment until the threat model gave it an ID (SEC-05). |
| 128-147 | Options type, endpoint, field mask (Essentials-only, with a pricing warning), 5-second timeout, fixture prefix. | Right. |
| 152-163 | Fixture ids are answered locally and never sent to Google; an unknown fixture id is refused. | Right, given 99-112's stale caveat. |
| 165-167 | `isWellFormedPlaceId()` runs before the id gets near a URL. | Right. With the fixed host (137) and `encodeURIComponent` (196), there's no path or host injection, so no SSRF. |
| 169-172 | In a production build, no signed-in user means `lookup_failed`, logged with the place id only. | Right. Vercel previews are production builds too. Outside production it's skipped by design (`next dev`). |
| 174-181 | Lookup, then `judgePlace()` (excluded types, distance from campus), then store. | Right. The server is the control, not the picker. |
| 185-189 | `fixturePlacesAllowed()` is read per request. | Right. |
| 192-199 | The key is read outside `try` (missing config isn't a "failed lookup"); the session token is validated before use. | Right. |
| 201-210 | `fetch` with the key in a **header**, not the URL; a timeout; `cache: "no-store"`. | Right. The key stays out of URLs and logs, and Google's terms on caching are respected. |
| 211-220 | On a network error or timeout, only `error.name` is logged ("it could carry the request, and the request carries the key"). | Right. That's the detail most often got wrong; here it is right. |
| 222-234 | A non-OK response is mapped by `classifyPlaceDetailsError()`, and Google's parsed error fields are logged. | Right. The fields don't include the key. |
| 236-241 | A defensive parse; an unusable body is `lookup_failed`. | Right. |
| 245-281 | `storeLocation()`: the secret-key client, upsert on `place_id`, Google's coordinates, `validated_at`. Postgres's text goes to logs only; everything else is `lookup_failed`. | Right. This is the only use of the secret key (ADR 0008 rule 12), and it writes one table. |

### What the AI got wrong

The executable code is right; I found no defect in it. What went wrong is the **reasoning around
it**, and in this repository that matters, because CLAUDE.md tells every agent to "read the stub
comment before you fill one in". Comments here are treated as the spec.

1. **The security comments went stale when other sessions changed what they describe (SEC-17).**
   A4 made `requireUser()` real, and M5 seeded the fixture rows. Neither session updated the
   comment here that argued from the old state. The checks survived; the explanation of *why*
   the billed path is safe no longer matches reality.
2. **A known security gap lived only in a comment (SEC-05).** "NOT done yet: per-user rate
   limiting" was an honest disclosure, but it had no ticket or owner until the threat model
   gave it one.

### The prompt change that would have prevented it

These go in the prompts of the sessions that *changed what the comment described* (A4 and M5),
and in CLAUDE.md:

> 1. **When your change makes another file's comment false, fix the comment in the same PR.**
>    Before finishing, grep `src/`, `supabase/` and `docs/` for the names of what you changed
>    (here `requireUser`, `FIXTURE_USER`, "not seeded"), and update any comment that argues from
>    the old behaviour, security comments first.
> 2. **A security control you defer must get an ID in the same PR** (a ticket in
>    `docs/tickets.md` or a row in `docs/security/findings.md`), not only a "NOT done yet"
>    comment.

---

## Pattern across both files

In both files, the AI's security reasoning was careful about what was **inside the file** and
weakest about what was **outside it**:
- dashboard toggles (SEC-11, SEC-12, SEC-15);
- other modules changing underneath it (SEC-17);
- gaps it noticed but didn't file (SEC-05).

The common fix is to make outside state visible to review:
- settings live in `config.toml`, as ADR 0009 proposes;
- comments are updated by whoever invalidates them;
- every deferred control gets an ID.
