// Vaasenk Mobile — ESLint v9 flat config.
//
// `eslint-config-expo` ships only legacy `.eslintrc`-style config as of
// v8.x, so we use FlatCompat (same pattern as apps/web).

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  {
    ignores: [
      '.expo/**',
      'node_modules/**',
      'dist/**',
      'babel.config.js',
      'metro.config.js',
      'tailwind.config.js',
      'theme/tailwind-vaasenk.cjs',
      'eslint.config.mjs',
      'expo-env.d.ts',
      'nativewind-env.d.ts',
    ],
  },
  ...compat.extends('expo'),
  {
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
];
