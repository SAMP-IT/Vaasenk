// Vaasenk Mobile — Tailwind/NativeWind theme bridge.
//
// `tailwind.config.js` runs in Node and cannot directly require the TS
// `native-theme.ts` from @vaasenk/ui without a build step. Rather than wire
// a TS loader into the Tailwind pipeline (slow, fragile), we mirror the
// SAME values here as a CommonJS module so Tailwind can consume them
// synchronously. The source of truth remains `design-docs/vaasenk.tokens.json`
// per CLAUDE.md §4 — this file simply re-states those exact hex values so
// the className strings (`bg-vaasenk-red`, `text-vaasenk-ink`, …) resolve.
//
// If you change a color, update BOTH this file AND
// packages/ui/tokens/native-theme.ts. The CI guard for that consistency
// lives in design-docs/ (token drift check — backlog).

/** @type {{ colors: Record<string, string | Record<string, string>>, radius: Record<string, number>, spacing: Record<string, number> }} */
const vaasenkTailwind = {
  colors: {
    'vaasenk-red': '#A00000',
    'vaasenk-gold': '#FECA02',
    'vaasenk-ember': '#C1121F',
    'vaasenk-sunrise': '#FF7A18',
    'vaasenk-coral': '#FF5C8A',
    'vaasenk-canvas': '#FFF7EC',
    'vaasenk-cream': '#FFFDF8',
    'vaasenk-peach': '#FFE8D2',
    'vaasenk-rose': '#FFE3EA',
    'vaasenk-ink': '#231516',
    'vaasenk-maroon': '#4A0508',
    'vaasenk-muted': '#7A5A52',
    'vaasenk-subtle': '#A88479',
    'vaasenk-inverse': '#FFFFFF',
    'vaasenk-success': '#17A75B',
    'vaasenk-warning': '#F59E0B',
    'vaasenk-danger': '#DC2626',
    'vaasenk-info': '#2563EB',
    'vaasenk-line-sand': '#EAD7CF',
  },
  borderRadius: {
    'vaasenk-xs': '8px',
    'vaasenk-sm': '12px',
    'vaasenk-md': '16px',
    'vaasenk-lg': '22px',
    'vaasenk-xl': '28px',
    'vaasenk-2xl': '36px',
    'vaasenk-3xl': '44px',
  },
  spacing: {
    'vaasenk-xs': '4px',
    'vaasenk-sm': '8px',
    'vaasenk-md': '12px',
    'vaasenk-lg': '16px',
    'vaasenk-xl': '20px',
    'vaasenk-2xl': '24px',
    'vaasenk-3xl': '32px',
    'vaasenk-4xl': '40px',
    'vaasenk-5xl': '56px',
    'vaasenk-6xl': '80px',
  },
};

module.exports = vaasenkTailwind;
