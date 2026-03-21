import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import harnessPlugin from '@harness-engineering/eslint-plugin';

export default [
  {
    ignores: [
      'node_modules',
      'dist',
      'build',
      'coverage',
      '.turbo',
      '.next',
      'vitest.config.ts',
      'vite.config.ts',
      'turbo.config.ts',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...tsPlugin.configs['recommended-requiring-type-checking'].rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'warn',
        { allowExpressions: true },
      ],
    },
  },
  {
    files: ['**/tests/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
    },
  },
  {
    files: ['packages/*/src/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.mjs', 'packages/*/scripts/**/*.mjs'],
    plugins: {
      '@harness-engineering': harnessPlugin,
    },
    rules: {
      '@harness-engineering/no-unix-shell-command': 'warn',
      '@harness-engineering/no-hardcoded-path-separator': 'warn',
    },
  },
  prettierConfig,
];
