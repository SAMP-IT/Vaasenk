# Vaasenk Design Token Package v0.1

This package contains implementation-ready design files for the Vaasenk Web App and Mobile App.

## Files

| File | Purpose |
|---|---|
| `vaasenk.tokens.json` | Platform-neutral design tokens in JSON format. Use as the source for design-token pipelines, Figma tokens, Style Dictionary, or documentation. |
| `vaasenk.theme.css` | CSS variables, reusable classes, animations, component primitives and responsive rules for Next.js/Web. |
| `vaasenk.tailwind.theme.css` | Tailwind v4 `@theme` tokens. Import into your global CSS if using Tailwind v4. |
| `vaasenk.design-tokens.ts` | TypeScript token object for Next.js, React components, Storybook and internal UI packages. |
| `vaasenk.native-theme.ts` | React Native / Expo compatible tokens, including gradient arrays for `expo-linear-gradient`. |

## Vaasenk Design Direction

Vaasenk should not feel like a boring SaaS dashboard.

The UI direction is:

- Warm, friendly and education-first.
- Rich gradients, but readable.
- Large rounded cards and glassmorphism surfaces.
- Motion-inspired details: glows, orbit lines, soft floating shapes.
- Subtle use of `#A00000` and `#FECA02` as brand anchors.
- Cream, peach and rose backgrounds to reduce stress and make the app feel inviting.
- Role-specific personality:
  - Admin: control and clarity.
  - Teacher: productivity and confidence.
  - Student: motivation and ease.

## Core Colors

```txt
Vaasenk Red: #A00000
Learning Gold: #FECA02
Ember Red: #C1121F
Sunrise Orange: #FF7A18
Coral Pink: #FF5C8A
Warm Canvas: #FFF7EC
Cream Card: #FFFDF8
Ink: #231516
Deep Maroon: #4A0508
```

## Usage in Next.js

Add this to `app/globals.css`:

```css
@import "./vaasenk.theme.css";
```

Then use classes:

```tsx
export default function WelcomeCard() {
  return (
    <section className="vaasenk-app-bg">
      <div className="vaasenk-page-shell">
        <div className="vaasenk-hero-card vaasenk-animate-gradient">
          <h1>Teach more. Copy less.</h1>
          <button className="vaasenk-button-primary">Get Started</button>
        </div>
      </div>
    </section>
  );
}
```

## Usage with Tailwind v4

Import `vaasenk.tailwind.theme.css` in your global Tailwind CSS.

```css
@import "tailwindcss";
@import "./vaasenk.tailwind.theme.css";
```

Example:

```tsx
<div className="rounded-vaasenk-3xl bg-vaasenk-cream-card shadow-vaasenk-card-soft text-vaasenk-ink">
  <button className="rounded-vaasenk-full bg-vaasenk-red text-vaasenk-inverse">
    Continue
  </button>
</div>
```

## Usage in React Native / Expo

Install Expo Linear Gradient:

```bash
npx expo install expo-linear-gradient
```

Use:

```tsx
import { LinearGradient } from "expo-linear-gradient";
import { vaasenkNative } from "./vaasenk.native-theme";

export function PrimaryButton() {
  return (
    <LinearGradient
      colors={vaasenkNative.gradients.heroSunrise.colors}
      locations={vaasenkNative.gradients.heroSunrise.locations}
      start={vaasenkNative.gradients.heroSunrise.start}
      end={vaasenkNative.gradients.heroSunrise.end}
      style={vaasenkNative.components.button}
    />
  );
}
```

## Do

- Use gradient hero cards for emotional entry points.
- Use glass cards over warm backgrounds.
- Use red for primary action and active states.
- Use gold for reward, highlight, notification and delight.
- Keep screen density low.
- Use generous spacing and large rounded cards.
- Use animation subtly: hover, floating blobs, progress reveals.

## Do Not

- Do not make the dashboard look like a generic CRM.
- Do not use red and gold as loud political blocks.
- Do not put long body copy on gradient surfaces.
- Do not animate everything at once.
- Do not use tiny sharp cards.
- Do not overcrowd student screens.
- Do not use dark mode as the default MVP style.

## Recommended Implementation Order

1. Load tokens.
2. Build primitives: Button, Card, Input, Chip, BottomNav.
3. Build generic screens: Splash, Onboarding, Role Selection, Login, Profile, Settings, Notifications, Help.
4. Build role-specific screens.
5. Add micro-interactions.
6. Add accessibility pass.
