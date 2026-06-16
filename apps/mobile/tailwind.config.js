// Vaasenk Mobile — Tailwind config consumed by NativeWind v4.
//
// NativeWind v4 still requires Tailwind v3 syntax (Tailwind v4's Oxide
// engine doesn't yet target React Native). The web app uses Tailwind v4;
// this is an explicit, isolated divergence for the mobile target.
// We re-create the Vaasenk palette here from `theme/tailwind-vaasenk.cjs`,
// which mirrors the values in `@vaasenk/ui` (see that file for the rationale).

const vaasenk = require('./theme/tailwind-vaasenk.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './src/**/*.{js,jsx,ts,tsx}',
    // NativeWind preset must process workspace component files too if/when
    // packages/ui ever ships RN components. Today it only ships tokens, so
    // this is a forward-compatible no-op.
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: vaasenk.colors,
      borderRadius: vaasenk.borderRadius,
      spacing: vaasenk.spacing,
      fontFamily: {
        sans: ['Inter_400Regular', 'system-ui'],
        // Custom weights map to Inter_<weight><style>. Loaded via
        // @expo-google-fonts/inter in App.tsx.
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
        'inter-bold': ['Inter_700Bold'],
        'inter-extrabold': ['Inter_800ExtraBold'],
      },
    },
  },
  plugins: [],
};
