---
name: vaasenk-component
description: Use when creating, editing, restyling, or reviewing ANY UI component, page, layout, or visual element in the Vaasenk monorepo (apps/web Next.js 15 or apps/mobile Expo). Enforces the Vaasenk design system — design tokens from packages/ui, brand gradients, glassmorphism, the five required component states (default / loading / empty / error / disabled), Tailwind v4 canonical class syntax, and role-specific visual personality. Invoke whenever the work involves a .tsx component, a page in app/, a layout, a form field, a button, a card, or any visual polish.
---

# Vaasenk Component Skill

Authoritative spec lives in `CLAUDE.md` §4 (Design System — Mandatory Rules) and `design-docs/README.md` (Vaasenk Design Direction). This skill compresses both into a working checklist + concrete patterns. Use it for every visual file you touch.

## 1. Tokens — never hardcode colors, spacing, radii, or shadows

All tokens are in `packages/ui/tokens/`. Three forms — pick by surface:

| Need | Import | Used in |
|---|---|---|
| Tailwind v4 utilities | already imported via `@vaasenk/ui/tokens/tailwind` in `apps/web/src/app/globals.css` | className strings (preferred path) |
| Raw CSS variables | already imported via `@vaasenk/ui/tokens/css` in the same globals.css | inline styles, `bg-(--vaasenk-*)` |
| TypeScript object | `import { vaasenkColors, vaasenkGradients, ... } from '@vaasenk/ui/tokens'` | runtime React code |
| React Native | `import { vaasenkNative } from '@vaasenk/ui/tokens/native'` | apps/mobile |

If you find yourself writing `#A00000`, `rgb(160,0,0)`, or `style={{ color: ... }}` — STOP. Use a token.

## 2. Brand palette to memorize

- `#A00000` Vaasenk Red — primary CTA, active states (`vaasenk-red`)
- `#FECA02` Learning Gold — highlights, AI sparkle, progress (`vaasenk-gold`)
- `#5A0013` Deep Burgundy — hero depth, admin AI panels (`vaasenk-deep-maroon`)
- `#FF7A1A` Warm Ember — gradient transition (`vaasenk-sunrise-orange`)
- `#FF5C7A` Rose Coral — student cards (`vaasenk-coral-pink`)
- `#FFF7EA` Cream Canvas — page background, NEVER white (`vaasenk-warm-canvas` / `vaasenk-cream-canvas`)
- `#FFE8D2` Peach Wash — secondary panels (`vaasenk-peach-wash`)
- `#FFE3EA` Rose Wash — soft accents (`vaasenk-rose-wash`)
- `#24161A` Ink — primary text (`vaasenk-ink`)
- `#7A5A52` Muted Cocoa — secondary text (`vaasenk-muted`)
- `#A88479` Subtle — tertiary text (`vaasenk-subtle`)
- `#EAD7CF` Line Sand — borders, dividers (`vaasenk-line-sand`)

Status colors: `vaasenk-success` (#16A34A), `vaasenk-danger` (#DC2626), `vaasenk-warning` (#F59E0B), `vaasenk-info` (#2563EB).

## 3. Tailwind v4 canonical class syntax (REQUIRED)

| Avoid | Use |
|---|---|
| `bg-gradient-to-r` | `bg-linear-to-r` |
| `from-[#A00000]` | `from-vaasenk-red` |
| `via-[#FF7A1A]` | `via-vaasenk-sunrise-orange` |
| `to-[#FECA02]` | `to-vaasenk-gold` |
| `text-[color:var(--vaasenk-ink)]` | `text-(--vaasenk-ink)` |
| `bg-[color:var(--vaasenk-rose-wash)]` | `bg-(--vaasenk-rose-wash)` |
| `border-[color:var(--vaasenk-line-sand)]` | `border-(--vaasenk-line-sand)` |

Arbitrary values are still fine for one-off composed shadows / multi-stop radial gradients where no token matches:

```tsx
className="shadow-[0_8px_24px_rgba(160,0,0,0.18)]"
className="bg-[radial-gradient(circle_at_20%_10%,rgba(254,202,2,0.25)_0%,transparent_25%)]"
```

## 4. Brand gradients (use these EXACT recipes)

```ts
// Primary CTA, hero cards — "Brand Flame"
'bg-linear-to-r from-vaasenk-red via-vaasenk-sunrise-orange to-vaasenk-gold'

// Page background — "Cream Sunrise" (use <PageShell> instead of hand-rolling)
'bg-[radial-gradient(circle_at_20%_10%,rgba(254,202,2,0.25)_0%,transparent_25%),linear-gradient(135deg,#FFF7EA_0%,#FFE3D2_45%,#FFF0F4_100%)]'

// Admin role hero — "Admin Royal"
'bg-linear-to-br from-[#5A0013] via-vaasenk-red to-[#FFB000]'

// Teacher role hero — "Teacher Orange"
'bg-linear-to-br from-vaasenk-red via-vaasenk-sunrise-orange to-vaasenk-gold'

// Student role hero — "Student Coral"
'bg-linear-to-br from-vaasenk-coral-pink via-[#FF8A4C] to-vaasenk-gold'

// AI panels — "Deep AI Glow"
'bg-linear-to-br from-[#3B0010] via-vaasenk-deep-maroon to-vaasenk-sunrise-orange'

// Glass surface (on gradients / cream)
'bg-white/72 backdrop-blur-[20px] border border-(--vaasenk-line-sand)'
```

Only short, white text on gradient surfaces. Long copy must sit on Cream or Glass.

## 5. The five required states (CLAUDE.md §5 — applies to EVERY interactive UI)

1. **Default** — normal interactive
2. **Loading** — use `<LoadingSkeleton />` from `@/components/ui/loading-skeleton` for surfaces, `<Loader2 className="size-4 animate-spin" />` from `lucide-react` inside buttons
3. **Empty** — use `<EmptyState title=... description=... action={...} />` from `@/components/ui/empty-state`. NEVER a blank page.
4. **Error** — red inline message with retry. Pattern:
   ```tsx
   <p
     role="alert"
     aria-live="polite"
     className="rounded-2xl border border-(--vaasenk-danger)/30 bg-(--vaasenk-danger)/10 px-4 py-3 text-sm text-(--vaasenk-danger)"
   >
     {message}
   </p>
   ```
5. **Disabled** — combine `disabled:opacity-70 disabled:cursor-not-allowed` plus a tooltip or helper text explaining WHY (don't just gray out without explanation)

## 6. Pre-built building blocks (already in `apps/web/src/components/ui/`)

ALWAYS compose these first; only build a new primitive if none fit.

- `<VaasenkButton>` — cva variants `primary` (Brand Flame), `secondary` (glass/outline), `ghost`, `gold`. Sizes `sm | md | lg`. `rounded-full`, 44px min-height on `md`+. Pass `asChild` to wrap a `<Link>`.
- `<GlassCard>` — `rounded-[24px]`, `bg-white/72`, `backdrop-blur-[20px]`, sand border, soft red shadow. `padding: sm | md | lg | none`. Polymorphic via `as`.
- `<PageShell>` — Cream Sunrise gradient + three floating blurred blobs (red / orange / gold). Wrap every full-page route. Pass `bare` to drop the blobs (dense list pages).
- `<LoadingSkeleton>` — shimmer placeholder; `variant: rect | circle | text`.
- `<EmptyState>` — glass card + icon tile + title + description + CTA.

Import via `@/components/ui/{kebab}`. Extend or compose; don't duplicate.

## 7. Card and button rules (CLAUDE.md §4)

- Cards: `rounded-[24px]` exactly (or `rounded-vaasenk-xl` = 28px when slightly larger is OK).
- Buttons: `rounded-full` (999px). Mobile min-height 44px via `min-h-[44px]`.
- Page background: NEVER plain white. Use `<PageShell>` or the Cream Sunrise gradient.
- Glass cards: use `<GlassCard>`. If hand-rolled, `bg-white/72 backdrop-blur-[20px] border border-(--vaasenk-line-sand)`.
- Soft red shadow: `shadow-[0_8px_24px_rgba(160,0,0,0.08)]` or `shadow-vaasenk-soft` utility.

## 8. Typography (Inter via next/font, wired to `--font-vaasenk`)

- Page heading: `text-3xl font-semibold tracking-tight text-(--vaasenk-ink)` (or `text-4xl` for hero)
- Section heading: `text-lg font-semibold text-(--vaasenk-ink)`
- Body: `text-base text-(--vaasenk-ink)`
- Muted body: `text-sm text-(--vaasenk-muted)`
- Subtle / legal: `text-xs text-(--vaasenk-subtle)`
- Eyebrow: `text-sm font-medium uppercase tracking-wider text-white/80` on gradient, `text-(--vaasenk-deep-maroon)` on cream

Never import decorative fonts. Inter only.

## 9. Form field pattern

```tsx
<div className="space-y-2">
  <label
    htmlFor={id}
    className="text-sm font-medium text-(--vaasenk-deep-maroon)"
  >
    {label}
  </label>
  <input
    id={id}
    {...inputProps}
    className="w-full rounded-2xl border border-(--vaasenk-line-sand) bg-white/80 px-4 py-3 text-base text-(--vaasenk-ink) placeholder:text-(--vaasenk-subtle) focus:border-(--vaasenk-red) focus:outline-none focus:ring-2 focus:ring-(--vaasenk-red)/30 disabled:cursor-not-allowed disabled:opacity-70"
  />
</div>
```

The trailing focus / disabled / placeholder modifiers are not optional. Same shape for `<select>` and `<textarea>` (textarea adds `min-h-[120px] resize-y`).

## 10. Role-specific personality (CLAUDE.md §4)

- **Admin** — Admin Royal gradient hero. More data density allowed (KPI rows, tables). Sidebar nav, info-dense charts. Tone: control + clarity.
- **Teacher** — Teacher Orange gradient hero. Action-first (upload / generate / AI tiles at the top). Minimize admin clutter. Tone: productivity + confidence.
- **Student** — Student Coral gradient hero. Reading-focused (cards, generous white space, two tiles per row max). NO teacher / admin actions visible. Tone: motivation + ease.

Check `user.role` before rendering admin / teacher-only actions. Don't just hide via CSS.

## 11. Accessibility + i18n hygiene

- Tap targets: 44px minimum on mobile (`min-h-[44px]`, `min-w-[44px]` on icon-only).
- Every form field: associated `<label htmlFor>` + `id`. Errors get `aria-describedby` pointing to the message.
- Loading: container has `role="status"` `aria-live="polite"` + visually hidden text via `sr-only`.
- Errors: container has `role="alert"`.
- Focus ring: visible, `focus-visible:ring-2 focus-visible:ring-(--vaasenk-red)/30`.
- Copy is `en-IN`. Pull strings to a `messages` constant near the top of the component so they're easy to extract for future `ta-IN` translation.

## 12. What NOT to do (CLAUDE.md §4 — hard rules)

- Do NOT make it look like a generic SaaS/CRM/ERP dashboard.
- Do NOT use red and gold as loud political blocks — keep them tasteful.
- Do NOT put long body copy on gradient surfaces. Short hero copy + white text only.
- Do NOT animate everything at once.
- Do NOT use tiny sharp cards.
- Do NOT overcrowd student screens.
- Do NOT use dark mode as the MVP default.
- Do NOT use plain white as a page background — Cream Canvas is the floor.
- Do NOT import decorative fonts. Inter only.

## 13. Quality gate before declaring "done"

1. Distinct from a stock ShadCN template? (Vaasenk should feel warm, gradient-driven, glass-laden.)
2. All 5 states implemented (default / loading / empty / error / disabled)?
3. All colors token-derived (no `#...` literals in `className`)?
4. All spacing on the 4/8/12/16/24/32 px grid (Tailwind defaults)?
5. Focus ring uses `--vaasenk-red`?
6. Forms have labels + describedby for errors?
7. Mobile tap targets ≥ 44 px?
8. Page wrapped in `<PageShell>` (or has Cream Sunrise gradient inline)?
9. No `bg-gradient-*`, no `text-[color:var(...)]` arbitrary syntax — all canonical Tailwind v4?
