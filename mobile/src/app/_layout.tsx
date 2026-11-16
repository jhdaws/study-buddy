// Root layout: the signed-in screens are behind a guard, so a signed-out
// student only ever sees sign-in, and signing in or out switches stacks by
// itself (Expo Router's Stack.Protected).

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";

import { colors } from "@/components/theme";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function RootStack() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.page }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  const signedIn = Boolean(session);
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: colors.page } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" options={{ title: "Sessions" }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <RootStack />
    </AuthProvider>
  );
}
