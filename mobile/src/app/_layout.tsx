// Root layout. Loads Manrope (the web app's typeface) before anything
// renders, then puts the signed-in screens behind a guard: a signed-out
// student only ever sees sign-in, and signing in or out switches stacks by
// itself (Expo Router's Stack.Protected).

import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/manrope";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/components/theme";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function Loading({ dark }: { dark: boolean }) {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: dark ? colors.navy950 : colors.paper }}
    >
      <ActivityIndicator accessibilityLabel="Loading" color={dark ? "#ffffff" : colors.brand} />
    </View>
  );
}

function RootStack() {
  const { session, loading } = useAuth();
  if (loading) return <Loading dark />;
  const signedIn = Boolean(session);
  return (
    <>
      <StatusBar style={signedIn ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ contentStyle: { backgroundColor: colors.navy950 } }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  // A font that fails to load falls back to the system font rather than
  // blocking the app.
  const ready = fontsLoaded || Boolean(fontError);
  return (
    <SafeAreaProvider>
      <AuthProvider>{ready ? <RootStack /> : <Loading dark />}</AuthProvider>
    </SafeAreaProvider>
  );
}
