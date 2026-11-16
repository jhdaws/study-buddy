# Study Buddy mobile (Expo)

The phone app, built a slice at a time on the same Supabase project as the
web app. Expo SDK 58, Expo Router, TypeScript.

**Slice 1 (now):** sign in with your Vanderbilt email and password, or with
a code by email; see the open sessions under day headings, soonest first,
with seats left; pull down to refresh; sign out. Read-only. It looks like
the website: Manrope, the navy sign-in scene, and the same session cards.

**Not yet:** signing up (new students use the website first), the session
page, joining and leaving, hosting, chat, profile.

## Test it yourself (Windows, Mac or Linux)

You need Node 22 or newer and Git. From the repo:

```bash
git fetch origin
git checkout mob1-us-03-expo-sign-in-and-list
cd mobile
npm install
```

Then create `mobile/.env.local` with the same two public values the web app
uses (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the
web app's `.env.local`, or Supabase → Project Settings → API):

```
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<the publishable / anon key>
```

Never the secret key: RLS protects the data, and the app ships this key.

**In your browser (fastest):** `npx expo start --web`, then open the
address it prints (usually http://localhost:8081).

**On your phone:** install **Expo Go**, run `npx expo start`, and scan the
QR code (Camera app on iPhone, Expo Go on Android). Phone and laptop must be
on the same Wi-Fi; if campus Wi-Fi blocks it, use `npx expo start --tunnel`.

Sign in with your Study Buddy account (password, or "Email me a code").

## Checks

```bash
npm run typecheck
npm test            # pure rules: email/code checks, error messages, list shaping, campus time
```

CI runs both, plus a dependency audit, in the `mobile` job. `npx expo export
--platform ios --platform android` bundles the app without a device.

## How it fits

- **Same rules as the web app.** `src/lib/auth-rules.ts` mirrors the web
  app's email and code checks; `src/lib/sessions.ts` runs the same query as
  the web list (open, not ended, soonest first, blocked hosts left out).
  Security does not depend on either: RLS and the database decide.
- **No account creation from the app** (`shouldCreateUser: false`), so a
  student never skips the web app's name and password steps.
- **Session storage** follows Expo's Supabase guide (`expo-sqlite`
  localStorage). It is not encrypted: finding SEC-18 in
  `docs/security/findings.md`.
- Install packages with `npx expo install <name>` so versions match SDK 58.
  `react-dom` is pinned to the exact `react` version: Expo Router pulls it in
  for web, and a newer one breaks `npm ci` with a peer conflict.
  `.npmrc` sets `legacy-peer-deps`: npm's strict peer resolution crashes on
  vitest's optional peers next to React Native.
  If that cannot reach Expo's servers, use the version in
  `node_modules/expo/bundledNativeModules.json`.
