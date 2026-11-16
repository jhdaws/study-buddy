# Study Buddy mobile (Expo)

The phone app, built a slice at a time on the same Supabase project as the
web app. Expo SDK 58, Expo Router, TypeScript.

**Slice 1 (now):** sign in with your Vanderbilt email and password, or with
a code by email; see the open sessions, soonest first, with seats left; pull
down to refresh; sign out. Read-only.

**Not yet:** signing up (new students use the website first), the session
page, joining and leaving, hosting, chat, profile.

## Run it on your phone

1. Install **Expo Go** from the App Store or Google Play.
2. From this folder:

   ```bash
   cp .env.example .env.local   # then fill in both values
   npm install
   npx expo start
   ```

   The two values are the same as the web app's
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by
   design; RLS protects the data). Never put the secret key here.
3. Scan the QR code: with the Camera app on iPhone, or from inside Expo Go on
   Android. Phone and laptop must be on the same Wi-Fi; on campus Wi-Fi that
   blocks this, use `npx expo start --tunnel`.

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
  If that cannot reach Expo's servers, use the version in
  `node_modules/expo/bundledNativeModules.json`.
