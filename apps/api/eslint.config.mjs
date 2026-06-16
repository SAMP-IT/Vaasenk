// Vaasenk API — ESLint v9 flat config.
//
// Baseline: @eslint/js recommended + typescript-eslint recommended.
// We keep the rule list short and pragmatic for now — too-strict rules
// at this stage cause noise without catching real bugs. Tighten later
// when the auth + product modules stabilize.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      // Allow leading-underscore as "intentionally unused" — matches the
      // `_passwordHash` and `_deletedAt` destructure pattern in auth.service.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // class-validator DTOs use `!` and decorators heavily; banning `any`
      // outright produces too much noise around third-party types.
      '@typescript-eslint/no-explicit-any': 'warn',
      // NestJS heavily uses `interface` for DI tokens that look empty until
      // augmented — keep this off so we don't fight the framework.
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
];
