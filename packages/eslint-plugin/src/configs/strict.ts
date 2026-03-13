// src/configs/strict.ts
import type { TSESLint } from '@typescript-eslint/utils';

const config: TSESLint.FlatConfig.Config = {
  plugins: {
    '@harness-engineering': {
      rules: {}, // Will be populated by index.ts
    } as TSESLint.FlatConfig.Plugin,
  },
  rules: {
    '@harness-engineering/no-layer-violation': 'error',
    '@harness-engineering/no-circular-deps': 'error',
    '@harness-engineering/no-forbidden-imports': 'error',
    '@harness-engineering/require-boundary-schema': 'error',
    '@harness-engineering/enforce-doc-exports': 'error',
  },
};

export default config;
