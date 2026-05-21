# 02 — Design System & Component Library Plan

**Date:** 2026-05-21
**Status:** Draft for review
**Depends on:** `00-overview-and-mvp-cut-list.md`, `/Design-doc/`

---

## 1. North star

> *Vaasenk should not feel like a boring SaaS dashboard.*

The visual system is warm, education-first, gradient-rich, glassmorphic, motion-aware. It is anchored by two brand colors (`#A00000` Vaasenk Red, `#FECA02` Learning Gold) used sparingly as accents on cream/peach/rose canvases.

This document refines the existing token package in `/Design-doc/`. It does **not** redesign the tokens — those are locked. It defines:

1. How the token files are consumed.
2. The component primitives that wrap the tokens.
3. The composition rules (when to use which surface, when motion is allowed).
4. The "modern UI" polish layer that sits on top of the tokens.

## 2. Token consumption

Three files are loaded into the web app:

```css
/* web/styles/globals.css */
@import "tailwindcss";
@import "../Design-doc/vaasenk.tailwind.theme.css";  /* Tailwind v4 @theme */
@import "../Design-doc/vaasenk.theme.css";           /* CSS vars + helper classes */
```

The TS token object (`vaasenk.design-tokens.ts`) is imported into components that need programmatic access (e.g., gradient arrays, breakpoints):

```ts
import { vaasenkTokens } from "@/../Design-doc/vaasenk.design-tokens";
```

**Rule:** components MUST use token variables or Tailwind utility classes derived from `@theme`. Hard-coded colors, shadows, or radii in component code = code-review reject.

## 3. The 16 primitives

Each primitive is a typed React component in `components/primitives/`. Each has documented variants, required states, accessibility contract, and a Storybook entry.

| # | Primitive | Variants | Required states |
|---|-----------|----------|-----------------|
| 1 | `Button` | primary, secondary, ghost, danger, icon | idle, hover, focus, active, disabled, loading |
| 2 | `GlassCard` | default, interactive | idle, hover (if interactive), focus-within |
| 3 | `HeroCard` | red-glow, gold, student-candy | idle, animate-gradient (opt-in) |
| 4 | `RoleCard` | admin, teacher, student | idle, hover, selected |
| 5 | `Input` | text, email, password, search | idle, focus, error, disabled, with-leading-icon, with-trailing-action |
| 6 | `Textarea` | default | idle, focus, error, disabled, with-counter |
| 7 | `Select` | single, multi | idle, open, focus, error, disabled |
| 8 | `Chip` | filter, status, tag | inactive, active, disabled |
| 9 | `Tabs` | underline, segmented | inactive, active, focus, disabled |
| 10 | `Modal` | default, confirm, full-screen-mobile | open, closing |
| 11 | `Drawer` | right (default), bottom | open, closing |
| 12 | `BottomSheet` (mobile breakpoint only) | default | open, dragging, closing |
| 13 | `Toast` | success, info, warning, danger | enter, idle, exit |
| 14 | `ProgressRing` | indeterminate, determinate | idle, animating |
| 15 | `StatusBadge` | uploaded, processing, ai-ready, failed, draft, published, archived | idle |
| 16 | `EmptyState` | first-run, empty-list, error, permission-denied, offline | idle |

Also required but not counted as primitives (utilities):

- `SkeletonLoader` — a generic skeleton wrapper with shimmer.
- `RoleGate` — see spec 01.
- `RoleBadge` — text + dot in role color.

### Primitive contract

Every primitive:
- Accepts `className` (merged with `clsx` / `tailwind-merge`).
- Forwards refs.
- Implements `aria-*` per WAI-ARIA Authoring Practices.
- Respects `prefers-reduced-motion` for any motion it introduces.
- Has a visible focus ring (uses `vaasenk-focus-ring` from the token CSS).
- Renders correctly at 320px viewport width (no horizontal scroll).

## 4. Composition rules (what makes the UI "clean and modern")

The existing token package gives us colors, shadows, gradients, and a few helper classes. The polish layer below is the disciplined application that turns those into a coherent product, not a sample page.

### Surface hierarchy
Three surface tiers per screen, never more:

| Tier | Use | Examples |
|------|-----|----------|
| Canvas | `vaasenk-app-bg` (soft-canvas gradient with floating blobs) | Page background only. |
| Card | `GlassCard` (default) or solid cream-card | Lists, forms, panels, content blocks. |
| Hero | `HeroCard` with `red-glow` or `gold` gradient | One per screen, max. Used for the dashboard greeting, the AI assistant entry, or the empty-state's primary CTA — never decoratively. |

**The hero gradient is the most visually expensive element. One per screen. Never two.** This is the rule that separates "modern" from "tacky."

### Spacing rhythm
- Use only the token spacing scale (`--space-*`). No arbitrary values.
- Page padding: `--space-24` desktop, `--space-16` mobile.
- Card padding: `--space-24` (default), `--space-32` (hero), `--space-16` (compact list items).
- Vertical rhythm between sections: `--space-40` desktop, `--space-32` mobile.

### Typography pairings
- Page title: `web-h1` on white/cream; `web-h2` over hero gradients.
- Section header: `web-h2`.
- Card title: `web-h3`.
- Body: `web-body`.
- Label/meta/chip: `web-label`.

Never put long body copy on a gradient surface. Hero gradients are for short, emotional copy + 1 CTA. Lists, tables, and forms always sit on cream/glass.

### Color use
- Red `#A00000`: primary CTA, brand mark, active state, destructive confirm. Never as a full-page background.
- Gold `#FECA02`: badges, achievements, notification dots, the "AI Ready" badge specifically. Never as body text or large text.
- Coral pink `#FF5C8A`: student-facing accents only.
- Sunrise orange `#FF7A18`: gradient bridge color; rarely used as solid.
- Semantic colors (`--vaasenk-success/warning/danger/info`): for system status only, never as decoration.

### Role personality
Each role's primary surface has its own identity card gradient (`vaasenk-role-card--admin`, `--teacher`, `--student`). Beyond that, the role manifests subtly:

- **Admin**: deeper maroon accents, denser data layouts, more table-driven. Productivity tone.
- **Teacher**: sunrise/gold-leaning hero cards, generous spacing, AI-forward. Confidence tone.
- **Student**: coral-pink accents, more card-based, larger imagery, fewer numbers. Motivation tone.

### Motion
- Use the three duration tokens: `--duration-fast` (140ms — micro-interactions), `--duration-base` (220ms — most), `--duration-slow` (420ms — page enters).
- The ambient gradient flow (`vaasenk-animate-gradient`, 9s) is allowed on **one** hero per screen, never more.
- The floating background blobs (`vaasenk-app-bg::before/::after`) are always-on but stop on `prefers-reduced-motion: reduce`.
- Never animate everything at once. If two pieces enter at the same time, stagger by 80ms.

### Density
- Tables: 56px row height (admin), 64px (teacher).
- Cards: 132px min for role/feature cards; 96px min for list-item cards.
- Mobile bottom-sheet: minimum 320px content area.
- Empty states: 60% of viewport height; never a tiny "No data" label.

## 5. Component upgrades over the shipped tokens

The existing token CSS ships these named classes: `vaasenk-app-bg`, `vaasenk-page-shell`, `vaasenk-hero-card`, `vaasenk-glass-card`, `vaasenk-button-primary/secondary`, `vaasenk-input`, `vaasenk-chip`, `vaasenk-role-card`, `vaasenk-bottom-nav`, `vaasenk-fab`, `vaasenk-focus-ring`.

The component library wraps them but adds:

- **Disabled / loading states** for every interactive element (the shipped CSS has none).
- **Error states** for `Input`, `Textarea`, `Select` — uses `--vaasenk-danger` border + small message slot below.
- **A `Button` size scale** (sm 40px / md 52px (default) / lg 60px) — the shipped CSS has only one size.
- **`StatusBadge` palette** mapping each lifecycle status to its color:
  - Uploaded → muted (subtle)
  - Processing → warning (amber with pulse animation, stops on reduced-motion)
  - AI Ready → gold (with subtle gold-glow)
  - Failed → danger
  - Draft → muted with outline
  - Published → success
  - Archived → subtle with strikethrough text
- **`EmptyState` variants** that are full-bleed and warm — not generic "no data" rows. Each includes an illustration slot (SVG, can be a friendly geometric blob early on).
- **Skeletons** that use the cream-card surface and a gradient shimmer matching the gold accent.

## 6. Accessibility floor

- Color contrast: text on cream meets WCAG AA. Text on gradients meets AA only at `web-h2` size or larger — body text never sits on gradients.
- Every interactive element reachable by keyboard with visible focus ring (`vaasenk-focus-ring`).
- All form inputs have associated labels (visible or `aria-label`).
- Dynamic announcements (chat replies, toast appearances) use `aria-live="polite"`.
- Color is never the only signal — statuses use icon + color + text.
- All modals/drawers trap focus and restore on close.

## 7. Storybook

Phase 1 ships a Storybook with:
- All 16 primitives, all variants, all required states.
- Three "composition" stories: AdminDashboard hero, TeacherDashboard hero, StudentHome hero — proves the rules-of-three (canvas → card → hero) read as intended.
- A "tokens" page enumerating all colors, gradients, shadows, radii in use.

## 8. What this spec is NOT

- It is **not** a Figma file. The token package is the source of truth; Figma would duplicate without authority.
- It is **not** a redesign brief. We are not rebuilding the token system.
- It is **not** a complete component catalog. Composite components (e.g., `ClassroomCard`, `NoteListItem`, `ChatMessage`) live in `components/domain/*` and are specced inside the per-role specs (03, 04).
