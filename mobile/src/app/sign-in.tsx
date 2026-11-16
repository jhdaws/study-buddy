// Sign in (US-01): Vanderbilt email and password, like the web app's default,
// or a one-time code by email. The app signs existing students in; it does
// not create accounts (shouldCreateUser: false), because the web app's name
// and password steps would be skipped. New students sign up on the website.
// On success the root layout's guard switches to the signed-in screens.

import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, TAP } from "@/components/theme";
import {
  checkCode,
  checkEmail,
  passwordErrorMessage,
  sendCodeErrorMessage,
  verifyCodeErrorMessage,
} from "@/lib/auth-rules";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type Mode = "password" | "code-email" | "code-enter";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch {
      setError("Something went wrong. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function withEmail(next: (value: string) => Promise<void>) {
    const checked = checkEmail(email);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    void run(() => next(checked.value));
  }

  const signInWithPassword = () =>
    withEmail(async (address) => {
      if (!password) {
        setError("Enter your password.");
        return;
      }
      const { error: failure } = await supabase.auth.signInWithPassword({ email: address, password });
      // Never echo the password back; clear it after a failed try.
      if (failure) {
        setPassword("");
        setError(passwordErrorMessage(failure));
      }
    });

  const sendCode = () =>
    withEmail(async (address) => {
      const { error: failure } = await supabase.auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false },
      });
      if (failure) {
        setError(sendCodeErrorMessage(failure));
        return;
      }
      setCode("");
      setMode("code-enter");
    });

  const verifyCode = () =>
    withEmail(async (address) => {
      const checked = checkCode(code);
      if (!checked.ok) {
        setError(checked.message);
        return;
      }
      const { error: failure } = await supabase.auth.verifyOtp({
        email: address,
        token: checked.value,
        type: "email",
      });
      if (failure) setError(verifyCodeErrorMessage(failure));
    });

  if (!supabaseConfigured) {
    return (
      <SafeAreaView style={styles.page}>
        <Text style={styles.title}>Study Buddy</Text>
        <Text style={styles.body}>
          This build has no Supabase settings. Copy mobile/.env.example to mobile/.env.local, fill in
          both values, and restart Expo.
        </Text>
      </SafeAreaView>
    );
  }

  const primary =
    mode === "password"
      ? { label: "Sign in", onPress: signInWithPassword }
      : mode === "code-email"
        ? { label: "Email me a code", onPress: sendCode }
        : { label: "Sign in with code", onPress: verifyCode };

  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title} accessibilityRole="header">
            Study Buddy
          </Text>
          <Text style={styles.body}>
            {mode === "code-enter"
              ? `We sent a code to ${email.trim().toLowerCase()}. It works once, for 10 minutes.`
              : "Sign in with your Vanderbilt email."}
          </Text>

          {mode !== "code-enter" && (
            <View style={styles.field}>
              <Text style={styles.label} nativeID="email-label">
                Vanderbilt email
              </Text>
              <TextInput
                accessibilityLabelledBy="email-label"
                accessibilityLabel="Vanderbilt email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                placeholder="name@vanderbilt.edu"
                placeholderTextColor={colors.ink3}
                style={styles.input}
                editable={!busy}
              />
            </View>
          )}

          {mode === "password" && (
            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                accessibilityLabel="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                style={styles.input}
                editable={!busy}
                onSubmitEditing={signInWithPassword}
              />
            </View>
          )}

          {mode === "code-enter" && (
            <View style={styles.field}>
              <Text style={styles.label}>Code from the email</Text>
              <TextInput
                accessibilityLabel="Code from the email"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={14}
                style={styles.input}
                editable={!busy}
                onSubmitEditing={verifyCode}
              />
            </View>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            disabled={busy}
            onPress={primary.onPress}
            style={({ pressed }) => [styles.button, (pressed || busy) && { opacity: 0.8 }]}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{primary.label}</Text>}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setError("");
              setMode(mode === "password" ? "code-email" : "password");
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>
              {mode === "password" ? "Email me a code instead" : "Sign in with a password instead"}
            </Text>
          </Pressable>

          <Text style={styles.footnote}>New to Study Buddy? Sign up on the website first.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: 24, paddingTop: 64, gap: 16 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink },
  body: { fontSize: 16, color: colors.ink2, lineHeight: 22 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  input: {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.error, fontSize: 15 },
  button: {
    minHeight: TAP,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { minHeight: TAP, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: "500" },
  footnote: { color: colors.ink3, fontSize: 13, textAlign: "center" },
});
