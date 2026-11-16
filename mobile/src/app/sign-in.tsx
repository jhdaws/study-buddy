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

import AuthScene from "@/components/AuthScene";
import { colors, font, RADIUS, TAP } from "@/components/theme";
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
  const [focused, setFocused] = useState<string | null>(null);

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
      <AuthScene>
        <Text style={styles.title}>Almost there</Text>
        <Text style={styles.body}>
          This build has no Supabase settings. Copy mobile/.env.example to mobile/.env.local, fill in
          both values, and restart Expo.
        </Text>
      </AuthScene>
    );
  }

  const primary =
    mode === "password"
      ? { label: "Sign in", onPress: signInWithPassword }
      : mode === "code-email"
        ? { label: "Email me a code", onPress: sendCode }
        : { label: "Sign in with code", onPress: verifyCode };

  const input = (name: string) => [styles.input, focused === name && styles.inputFocused];

  return (
    <SafeAreaView style={styles.page} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <AuthScene>
            <Text style={styles.title} accessibilityRole="header">
              {mode === "code-enter" ? "Check your inbox" : "Sign in"}
            </Text>
            <Text style={styles.body}>
              {mode === "code-enter"
                ? `We sent a code to ${email.trim().toLowerCase()}. It works once, for 10 minutes.`
                : mode === "code-email"
                  ? "We'll email you a one-time code."
                  : "Use your Vanderbilt email and password."}
            </Text>

            <View style={styles.fields}>
              {mode !== "code-enter" && (
                <View style={styles.field}>
                  <Text style={styles.label}>Vanderbilt email</Text>
                  <TextInput
                    accessibilityLabel="Vanderbilt email"
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => setFocused("email")}
                    onBlur={() => setFocused(null)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="username"
                    placeholder="name@vanderbilt.edu"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    style={input("email")}
                    editable={!busy}
                    onSubmitEditing={mode === "code-email" ? sendCode : undefined}
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
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    secureTextEntry
                    autoComplete="current-password"
                    textContentType="password"
                    style={input("password")}
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
                    onFocus={() => setFocused("code")}
                    onBlur={() => setFocused(null)}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={14}
                    style={[input("code"), styles.codeInput]}
                    editable={!busy}
                    onSubmitEditing={verifyCode}
                  />
                </View>
              )}

              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
                disabled={busy}
                onPress={primary.onPress}
                style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, busy && styles.buttonBusy]}
              >
                {busy ? (
                  <ActivityIndicator color={colors.ink} accessibilityLabel="Working" />
                ) : (
                  <Text style={styles.buttonText}>{primary.label}</Text>
                )}
              </Pressable>
            </View>

            <View style={styles.links}>
              {mode === "code-enter" ? (
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setError(""); setMode("code-email"); }} style={styles.link}>
                  <Text style={styles.linkText}>Use a different email</Text>
                </Pressable>
              ) : null}
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
            </View>
          </AuthScene>
          <Text style={styles.footnote}>New to Study Buddy? Sign up on the website first.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy950 },
  title: { fontFamily: font.bold, fontSize: 24, color: "#ffffff", textAlign: "center", letterSpacing: -0.3 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.8)", textAlign: "center", marginTop: 6 },
  fields: { gap: 16, marginTop: 22 },
  field: { gap: 6 },
  label: { fontFamily: font.semibold, fontSize: 14, color: "#ffffff" },
  input: {
    height: 48,
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 16,
    fontFamily: font.medium,
    fontSize: 16,
    color: "#ffffff",
  },
  inputFocused: { borderColor: colors.blue200, backgroundColor: "rgba(255,255,255,0.12)" },
  codeInput: { fontFamily: font.bold, fontSize: 20, letterSpacing: 6, textAlign: "center" },
  errorBox: {
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: "rgba(255,180,180,0.4)",
    backgroundColor: "rgba(210,63,63,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontFamily: font.medium, fontSize: 15, lineHeight: 21, color: colors.dangerOnDark },
  button: {
    height: 48,
    borderRadius: RADIUS.field,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { backgroundColor: colors.sky50 },
  buttonBusy: { opacity: 0.85 },
  buttonText: { fontFamily: font.bold, fontSize: 16, color: colors.ink },
  links: { marginTop: 8, alignItems: "center" },
  link: { minHeight: TAP, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  linkText: { fontFamily: font.semibold, fontSize: 14, color: colors.blue200 },
  footnote: {
    fontFamily: font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    paddingVertical: 20,
    backgroundColor: colors.navy950,
  },
});
