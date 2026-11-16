// The web app's design tokens (src/app/globals.css, the 2026-10-11 calm
// pass), so the phone and the website look like one product: Manrope, navy
// for the brand, one blue for links, cool off-white paper. 44pt tap targets
// and 16pt input text, as in ADR 0004.

export const colors = {
  paper: "#f4f7fb",
  card: "#ffffff",
  line: "#dce3ee",
  field: "#7d8ca7",
  ink: "#0e1b33",
  ink2: "#4a5b78",
  brand: "#13294b",
  signal: "#2563c9",
  seat: "#1f7a50",

  navy950: "#050e20",
  navy900: "#0a1a36",
  navy700: "#12305e",
  blue600: "#2f74c8",
  blue200: "#b9dbf8",
  sky50: "#eef5fc",
  amber: "#f6c177",

  dangerOnLight: "#b42318",
  dangerOnDark: "#ffb4b4",
  danger: "#d23f3f",
};

/** Manrope weights, loaded once in the root layout (@expo-google-fonts/manrope). */
export const font = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
};

export const TAP = 44;
export const RADIUS = { field: 12, panel: 16 };
