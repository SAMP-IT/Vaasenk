// Vaasenk Web — ESLint v9 flat config.
//
// Uses FlatCompat to consume eslint-config-next (which still ships the
// legacy config shape as of Next 15.1). Move to native flat config once
// eslint-config-next publishes it.

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
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'eslint.config.mjs',
      'postcss.config.mjs',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // typescript-eslint v8 changed the schema; eslint-config-next still
      // references the v7 options. Disable until next/typescript catches up.
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
];
