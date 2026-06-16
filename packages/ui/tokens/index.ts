/**
 * @vaasenk/ui/tokens
 *
 * Re-exports the platform-neutral and TypeScript design tokens for Vaasenk.
 *
 * - design-tokens.ts   → web / Next.js / React (typed object)
 * - native-theme.ts    → React Native / Expo
 * - theme.css          → CSS variables, classes, animations
 * - tailwind.theme.css → Tailwind v4 @theme tokens
 * - vaasenk.tokens.json → platform-neutral source of truth
 *
 * The raw JSON file is exposed via the "@vaasenk/ui/tokens/json" subpath
 * export — import it directly in code that needs the platform-neutral source.
 *
 * Per CLAUDE.md §4: ALWAYS import tokens from this package.
 * NEVER hardcode colors, spacing, or radii.
 */

export * from "./design-tokens.js";
export * from "./native-theme.js";
