import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'coverage/**',
      'node_modules/**',
      'next-env.d.ts',
      'src/generated/**',
      // Static assets, including the checked-in minified RuneBolt bundle.
      'public/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    // Existing `eslint-disable` comments guard rules this config does not enable
    // (e.g. no-control-regex on the prompt-injection filter). Reporting them as
    // unused invites autofix to delete intent that a stricter config still needs.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // Demoted to warnings, not disabled: CI fails on errors, so these would
      // block every PR on pre-existing code this wave is not chartered to
      // rewrite. Both have legitimate current uses — `Record<string, any>` prop
      // bags validated at runtime by zod, and a lazy `require('bip322-js')`
      // inside a try/catch where a static import would turn a module-load
      // failure into a dead route. Tighten by fixing the warnings, not by
      // loosening this further.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
];
