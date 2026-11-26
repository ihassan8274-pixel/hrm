import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

// Deliberately narrow: the existing codebase has a large legacy surface of
// `any` and unused imports. Turning on the full recommended TypeScript set
// would produce >1k unrelated findings and hide the one rule that prevented a
// production incident: hooks must run unconditionally, before early returns.
export default [
  {
    ignores: [
      'dist/**',
      'android/**',
      'ios/**',
      'node_modules/**',
      'scripts/.build/**',
      'coverage/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier,
];
