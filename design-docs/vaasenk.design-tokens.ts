/* eslint-disable @typescript-eslint/consistent-type-definitions */
/**
 * Vaasenk Design Tokens
 * Version: 0.1.0
 *
 * Use this in Next.js, React, component libraries and Storybook.
 * Keep this file as the single typed source for JS/TS design usage.
 */

export type VaasenkRole = "admin" | "teacher" | "student";
export type VaasenkThemeMode = "light" | "dark";

export const vaasenkColors = {
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
    glassBorder: "rgba(255,255,255,0.42)",
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
  role: {
    admin: "#A00000",
    teacher: "#FF8A00",
    student: "#FF5C8A",
  },
} as const;

export const vaasenkGradients = {
  heroSunrise: "linear-gradient(135deg, #A00000 0%, #C1121F 34%, #FF7A18 70%, #FECA02 100%)",
  softCanvas:
    "radial-gradient(circle at 15% 10%, rgba(254,202,2,0.28), transparent 28%), radial-gradient(circle at 82% 4%, rgba(255,92,138,0.25), transparent 30%), linear-gradient(135deg, #FFF7EC 0%, #FFE8D2 52%, #FFE3EA 100%)",
  redGlow:
    "radial-gradient(circle at 50% 30%, rgba(254,202,2,0.34), transparent 30%), linear-gradient(145deg, #4A0508 0%, #A00000 48%, #FF7A18 100%)",
  goldCard: "linear-gradient(135deg, #FECA02 0%, #FFB020 52%, #FF7A18 100%)",
  studentCandy: "linear-gradient(135deg, #FF5C8A 0%, #FF7A18 58%, #FECA02 100%)",
  glassShine: "linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.54) 100%)",
} as const;

export const vaasenkTypography = {
  fontFamily: {
    display: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    body: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    control: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  web: {
    display: { fontSize: 72, lineHeight: 1.02, fontWeight: 800, letterSpacing: "-0.04em" },
    h1: { fontSize: 48, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.035em" },
    h2: { fontSize: 34, lineHeight: 1.15, fontWeight: 750, letterSpacing: "-0.025em" },
    h3: { fontSize: 24, lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.018em" },
    body: { fontSize: 16, lineHeight: 1.55, fontWeight: 400, letterSpacing: "-0.005em" },
    label: { fontSize: 13, lineHeight: 1.2, fontWeight: 650, letterSpacing: "0.01em" },
  },
  mobile: {
    title: { fontSize: 32, lineHeight: 1.08, fontWeight: 800, letterSpacing: "-0.03em" },
    section: { fontSize: 20, lineHeight: 1.18, fontWeight: 750, letterSpacing: "-0.02em" },
    body: { fontSize: 15, lineHeight: 1.45, fontWeight: 400, letterSpacing: "-0.004em" },
    caption: { fontSize: 12, lineHeight: 1.3, fontWeight: 500, letterSpacing: "0em" },
  },
} as const;

export const vaasenkSpacing = {
  0: 0,
  2: 2,
  4: 4,
  6: 6,
  8: 8,
  10: 10,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
  28: 28,
  32: 32,
  40: 40,
  48: 48,
  56: 56,
  64: 64,
  80: 80,
  96: 96,
} as const;

export const vaasenkRadius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  "2xl": 36,
  "3xl": 44,
  full: 999,
} as const;

export const vaasenkShadows = {
  cardSoft: "0 18px 50px rgba(74,5,8,0.08), 0 2px 8px rgba(74,5,8,0.05)",
  cardFloat: "0 32px 90px rgba(160,0,0,0.18), 0 8px 28px rgba(255,122,24,0.10)",
  glowRed: "0 0 0 1px rgba(160,0,0,0.14), 0 24px 60px rgba(160,0,0,0.24)",
  glowGold: "0 0 0 1px rgba(254,202,2,0.22), 0 18px 50px rgba(254,202,2,0.28)",
  mobileTab: "0 10px 30px rgba(160,0,0,0.18)",
} as const;

export const vaasenkMotion = {
  duration: {
    fast: 140,
    base: 220,
    slow: 420,
    ambient: 9000,
  },
  easing: {
    standard: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    spring: "cubic-bezier(0.18, 0.89, 0.32, 1.28)",
    smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
} as const;

export const vaasenkBreakpoints = {
  mobile: 390,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export const vaasenkRoleThemes = {
  admin: {
    label: "Admin",
    accent: vaasenkColors.role.admin,
    gradient: "linear-gradient(135deg, #4A0508 0%, #A00000 58%, #FF7A18 100%)",
    icon: "crown",
    emotionalTone: "control, clarity, institution management",
  },
  teacher: {
    label: "Teacher",
    accent: vaasenkColors.role.teacher,
    gradient: "linear-gradient(135deg, #FF8A00 0%, #FFB020 55%, #FECA02 100%)",
    icon: "graduation-cap",
    emotionalTone: "speed, confidence, classroom productivity",
  },
  student: {
    label: "Student",
    accent: vaasenkColors.role.student,
    gradient: vaasenkGradients.studentCandy,
    icon: "student",
    emotionalTone: "friendly, motivating, easy learning",
  },
} as const satisfies Record<VaasenkRole, unknown>;

export const vaasenkComponents = {
  primaryButton: {
    minHeight: 52,
    paddingX: vaasenkSpacing[24],
    radius: vaasenkRadius.full,
    background: vaasenkGradients.heroSunrise,
    color: vaasenkColors.text.inverse,
    boxShadow: vaasenkShadows.glowRed,
  },
  secondaryButton: {
    minHeight: 48,
    paddingX: vaasenkSpacing[20],
    radius: vaasenkRadius.full,
    background: "rgba(255,255,255,0.62)",
    color: vaasenkColors.brand.red,
    border: "1px solid rgba(160,0,0,0.12)",
  },
  glassCard: {
    background: vaasenkGradients.glassShine,
    border: "1px solid rgba(255,255,255,0.42)",
    radius: vaasenkRadius["3xl"],
    padding: vaasenkSpacing[24],
    backdropFilter: "blur(20px)",
    boxShadow: vaasenkShadows.cardSoft,
  },
  heroCard: {
    background: vaasenkGradients.redGlow,
    radius: vaasenkRadius["3xl"],
    padding: vaasenkSpacing[32],
    color: vaasenkColors.text.inverse,
    boxShadow: vaasenkShadows.cardFloat,
  },
  input: {
    minHeight: 52,
    radius: vaasenkRadius.lg,
    paddingX: vaasenkSpacing[16],
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(160,0,0,0.12)",
    focusRing: "0 0 0 4px rgba(254,202,2,0.18)",
  },
  mobileBottomNav: {
    height: 76,
    radius: vaasenkRadius["2xl"],
    background: "rgba(255,255,255,0.72)",
    activeColor: vaasenkColors.brand.red,
    fabBackground: vaasenkGradients.heroSunrise,
    boxShadow: vaasenkShadows.mobileTab,
  },
} as const;

export const vaasenkDesignSystem = {
  colors: vaasenkColors,
  gradients: vaasenkGradients,
  typography: vaasenkTypography,
  spacing: vaasenkSpacing,
  radius: vaasenkRadius,
  shadows: vaasenkShadows,
  motion: vaasenkMotion,
  breakpoints: vaasenkBreakpoints,
  roleThemes: vaasenkRoleThemes,
  components: vaasenkComponents,
} as const;

export function getVaasenkRoleTheme(role: VaasenkRole) {
  return vaasenkRoleThemes[role];
}

export function getVaasenkCssVars() {
  return {
    "--vaasenk-red": vaasenkColors.brand.red,
    "--vaasenk-gold": vaasenkColors.brand.gold,
    "--vaasenk-ink": vaasenkColors.text.ink,
    "--gradient-hero-sunrise": vaasenkGradients.heroSunrise,
    "--gradient-soft-canvas": vaasenkGradients.softCanvas,
  } as const;
}
