// The sign-in scene, after the web app's AuthScene: a dark study at night,
// a wall of book spines fading into the dark, a desk lamp and its warm pool
// of light, and the navy card with the form. Decoration is hidden from
// screen readers.

import type { ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, Ellipse, Line, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import Logo from "@/components/Logo";
import { colors, RADIUS } from "@/components/theme";

// Fixed spines (width, height %, tone), so the wall looks the same each time.
const TONES = ["#0e2547", "#12305e", "#0b1d3d", "#173764", "#0f2a52", "#14305a"];
const SHELVES = [0, 1, 2, 3].map((shelf) =>
  Array.from({ length: 22 }, (_, i) => {
    const n = (shelf * 31 + i * 17) % 23;
    return { width: 9 + (n % 7), height: 62 + ((n * 7) % 34), tone: TONES[(shelf + i * 5) % TONES.length] };
  }),
);

function Bookshelves({ height }: { height: number }) {
  return (
    <View style={[styles.shelves, { height }]} pointerEvents="none">
      {SHELVES.map((spines, i) => (
        <View key={i} style={styles.shelf}>
          <View style={styles.spines}>
            {spines.map((s, j) => (
              <View
                key={j}
                style={{
                  width: s.width,
                  height: `${s.height}%`,
                  marginRight: 2,
                  backgroundColor: s.tone,
                  borderTopLeftRadius: 2,
                  borderTopRightRadius: 2,
                }}
              />
            ))}
          </View>
          <View style={styles.ledge} />
        </View>
      ))}
    </View>
  );
}

/** Darkness over the shelves (a radial vignette) and the lamp's warm glow. */
function LightAndShade({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="vignette" cx="50%" cy="22%" rx="70%" ry="60%">
          <Stop offset="0" stopColor={colors.navy950} stopOpacity="0" />
          <Stop offset="0.55" stopColor={colors.navy950} stopOpacity="0.6" />
          <Stop offset="0.9" stopColor={colors.navy950} stopOpacity="1" />
        </RadialGradient>
        <RadialGradient id="glow" cx="50%" cy="14%" rx="55%" ry="26%">
          <Stop offset="0" stopColor="#ffd696" stopOpacity="0.32" />
          <Stop offset="0.45" stopColor={colors.amber} stopOpacity="0.1" />
          <Stop offset="1" stopColor={colors.amber} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill="url(#vignette)" />
      <Rect x="0" y="0" width={width} height={height} fill="url(#glow)" />
    </Svg>
  );
}

function Lamp() {
  return (
    <Svg viewBox="0 0 120 120" width={104} height={104}>
      <Line x1="60" y1="0" x2="60" y2="48" stroke="#2a4d80" strokeWidth="2" />
      <Path d="M34 82 L46 50 H74 L86 82 Z" fill="#1d4f8f" />
      <Path d="M46 50 H74 L76 56 H44 Z" fill={colors.blue600} />
      <Ellipse cx="60" cy="82" rx="26" ry="4" fill={colors.amber} />
      <Ellipse cx="60" cy="82" rx="20" ry="2.5" fill="#fff4dc" />
    </Svg>
  );
}

export default function AuthScene({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.page}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
        <Bookshelves height={height * 0.62} />
        <LightAndShade width={width} height={height} />
        <View style={styles.lamp}>
          <Lamp />
        </View>
      </View>
      <View style={styles.card}>
        <View style={styles.logo}>
          <Logo tone="light" />
        </View>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.navy950, paddingHorizontal: 16, alignItems: "center" },
  shelves: { position: "absolute", top: 0, left: 0, right: 0, paddingTop: 24, gap: 12, opacity: 0.9 },
  shelf: { flex: 1, justifyContent: "flex-end" },
  spines: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", height: "88%", overflow: "hidden" },
  ledge: { height: 8, backgroundColor: "#081630" },
  lamp: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  card: {
    marginTop: 120,
    width: "100%",
    maxWidth: 400,
    borderRadius: RADIUS.panel,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(10,26,54,0.92)",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 30 },
    elevation: 12,
  },
  logo: { alignItems: "center", marginBottom: 20 },
});
