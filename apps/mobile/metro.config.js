// Vaasenk Mobile — Metro config for a Turborepo monorepo.
//
// Reference: https://docs.expo.dev/guides/monorepos/
//
// Standard pattern:
//   1. Start from `getDefaultConfig(projectRoot)` so Expo's defaults apply.
//   2. Tell Metro the monorepo root so it watches sibling packages and walks
//      up the node_modules tree when resolving.
//   3. Add explicit `watchFolders` for the workspace root so hot-reload picks
//      up edits in packages/ui and packages/shared-types.
//   4. Add `nodeModulesPaths` for both app-local AND repo-root node_modules
//      so hoisted deps resolve. `disableHierarchicalLookup: true` keeps
//      resolution deterministic across machines (no surprise traversal).
//   5. Layer NativeWind on with `withNativeWind({ input: './global.css' })`.

const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch workspace root so changes to packages/ui, packages/shared-types,
//    etc. trigger Metro reloads.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from the app first, then fall back to repo-root
//    node_modules (Turborepo hoists most deps there).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Deterministic resolution — no walking up from arbitrary cwd.
config.resolver.disableHierarchicalLookup = true;

// 4. NativeWind v4 wraps the config with className -> RN style compilation.
//    `./global.css` is the Tailwind entry that holds @tailwind directives
//    plus any global token references.
module.exports = withNativeWind(config, {
  input: './global.css',
});
