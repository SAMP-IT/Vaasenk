# Mobile App Assets

Placeholders required by `app.json`:

- `icon.png` — 1024×1024 PNG, app icon.
- `splash.png` — 1284×2778 (or any portrait) PNG, native splash screen.
- `adaptive-icon.png` — 1024×1024 PNG, Android foreground layer.
- `favicon.png` — 48×48 PNG, web favicon.

These are not committed yet — Sprint 7.1 ships the scaffolding. Drop the
final brand assets in here before the first EAS Build. Until then,
`expo prebuild` and `expo start` work fine; `eas build` will fail loudly
asking for them.
