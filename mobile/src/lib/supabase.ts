// The one Supabase client for the mobile app, set up the way Expo's Supabase
// guide recommends for SDK 58 (docs.expo.dev/guides/using-supabase):
// sessions persist in expo-sqlite's localStorage, tokens refresh only while
// the app is in the foreground, and there is no URL to read a session from.
//
// The URL and publishable key are public by design; RLS protects the data.
// The secret key must never be in this app.
//
// Known gap (SEC-18): expo-sqlite's localStorage is not encrypted, so the
// refresh token sits in the app's sandbox in plain form. See
// docs/security/findings.md.

import "expo-sqlite/localStorage/install";

import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** False until mobile/.env.local has both values; the app says so instead of crashing. */
export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || "http://localhost", key || "missing-key", {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh tokens only while the app is open, as Supabase recommends for
// React Native: a backgrounded app can't run timers reliably.
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
