// The Study Buddy mark and wordmark, the same as the web app's
// (src/components/ui/Logo.tsx): two overlapping discs, two people, one
// session, on a navy tile. Original artwork; no Vanderbilt marks.

import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, font } from "@/components/theme";

export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <View
      style={[styles.tile, { width: size, height: size, borderRadius: size / 4 }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg viewBox="0 0 40 40" width={size} height={size}>
        <Circle cx="16" cy="20" r="7" fill="#ffffff" />
        <Circle cx="24" cy="20" r="7" fill="#7fb0f2" fillOpacity={0.9} />
      </Svg>
    </View>
  );
}

export default function Logo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header" accessibilityLabel="Study Buddy">
      <LogoMark />
      <Text style={[styles.word, { color: tone === "light" ? "#ffffff" : colors.ink }]}>Study Buddy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  word: { fontFamily: font.bold, fontSize: 17, letterSpacing: -0.2 },
});
