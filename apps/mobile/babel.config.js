// Vaasenk Mobile — Babel config.
//
// - `babel-preset-expo` handles RN + Hermes + Reanimated worklets.
// - `nativewind/babel` rewrites Tailwind className strings into RN styles.
// - `react-native-reanimated/plugin` must be the LAST plugin (Reanimated v3 rule).
//
// `jsxImportSource: "nativewind"` lets the className prop work on native
// components without monkey-patching every component manually (NativeWind v4
// "JSX transform" mode).

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      // Reanimated must remain last.
      'react-native-reanimated/plugin',
    ],
  };
};
