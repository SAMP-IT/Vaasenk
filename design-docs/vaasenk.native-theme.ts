/**
 * Vaasenk Native Theme
 * React Native / Expo compatible tokens.
 *
 * For gradients use expo-linear-gradient:
 * <LinearGradient colors={vaasenkNative.gradients.heroSunrise.colors} start={...} end={...} />
 */

export type VaasenkNativeRole = "admin" | "teacher" | "student";

export const vaasenkNative = {
  colors: {
    brand: {
      red: "#A00000",
      gold: "#FECA02",
      emberRed: "#C1121F",
      sunriseOrange: "#FF7A18",
      coralPink: "#FF5C8A",
    },
    surface: {
      warmCanvas: "#FFF7EC",
      creamCard: "#FFFDF8",
      peachWash: "#FFE8D2",
      roseWash: "#FFE3EA",
      glassWhite: "rgba(255,255,255,0.72)",
    },
    text: {
      ink: "#231516",
      deepMaroon: "#4A0508",
      muted: "#7A5A52",
      subtle: "#A88479",
      inverse: "#FFFFFF",
    },
    semantic: {
      success: "#17A75B",
      warning: "#F59E0B",
      danger: "#DC2626",
      info: "#2563EB",
    },
  },
  gradients: {
    heroSunrise: {
      colors: ["#A00000", "#C1121F", "#FF7A18", "#FECA02"],
      locations: [0, 0.34, 0.7, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    redGlow: {
      colors: ["#4A0508", "#A00000", "#FF7A18"],
      locations: [0, 0.48, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    goldCard: {
      colors: ["#FECA02", "#FFB020", "#FF7A18"],
      locations: [0, 0.52, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    studentCandy: {
      colors: ["#FF5C8A", "#FF7A18", "#FECA02"],
      locations: [0, 0.58, 1],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
  },
  typography: {
    fontFamily: "Inter",
    title: { fontSize: 32, lineHeight: 35, fontWeight: "800" as const },
    section: { fontSize: 20, lineHeight: 24, fontWeight: "700" as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
    label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const },
  },
  spacing: {
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    "2xl": 24,
    "3xl": 32,
    "4xl": 40,
    "5xl": 56,
    "6xl": 80,
  },
  radius: {
    xs: 8,
    sm: 12,
    md: 16,
    lg: 22,
    xl: 28,
    "2xl": 36,
    "3xl": 44,
    full: 999,
  },
  shadows: {
    cardSoft: {
      shadowColor: "#4A0508",
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.08,
      shadowRadius: 50,
      elevation: 6,
    },
    glowRed: {
      shadowColor: "#A00000",
      shadowOffset: { width: 0, height: 24 },
      shadowOpacity: 0.24,
      shadowRadius: 60,
      elevation: 10,
    },
  },
  components: {
    screen: {
      backgroundColor: "#FFF7EC",
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: "rgba(255,255,255,0.78)",
      borderRadius: 28,
      padding: 20,
    },
    button: {
      minHeight: 52,
      borderRadius: 999,
      paddingHorizontal: 24,
    },
    input: {
      minHeight: 52,
      borderRadius: 22,
      paddingHorizontal: 16,
      backgroundColor: "rgba(255,255,255,0.72)",
      borderWidth: 1,
      borderColor: "rgba(160,0,0,0.12)",
    },
    bottomNav: {
      height: 76,
      borderRadius: 36,
      backgroundColor: "rgba(255,255,255,0.78)",
    },
  },
  roles: {
    admin: { accent: "#A00000", gradient: "redGlow", icon: "crown" },
    teacher: { accent: "#FF8A00", gradient: "goldCard", icon: "graduation-cap" },
    student: { accent: "#FF5C8A", gradient: "studentCandy", icon: "student" },
  },
} as const;

export function getVaasenkNativeRoleTheme(role: VaasenkNativeRole) {
  return vaasenkNative.roles[role];
}
