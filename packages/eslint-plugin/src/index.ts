// src/index.ts
import { rules } from './rules';

// Define the plugin object
const plugin = {
  meta: {
    name: '@harness-engineering/eslint-plugin',
    version: '0.1.0',
  },
  rules,
  configs: {
    recommended: {
      plugins: {
        get '@harness-engineering'() {
          return plugin;
        },
      },
      rules: {
        '@harness-engineering/no-layer-violation': 'error',
        '@harness-engineering/no-circular-deps': 'error',
        '@harness-engineering/no-forbidden-imports': 'error',
        '@harness-engineering/require-boundary-schema': 'warn',
        '@harness-engineering/enforce-doc-exports': 'warn',
      },
    },
    strict: {
      plugins: {
        get '@harness-engineering'() {
          return plugin;
        },
      },
      rules: {
        '@harness-engineering/no-layer-violation': 'error',
        '@harness-engineering/no-circular-deps': 'error',
        '@harness-engineering/no-forbidden-imports': 'error',
        '@harness-engineering/require-boundary-schema': 'error',
        '@harness-engineering/enforce-doc-exports': 'error',
      },
    },
  },
};

// ESM default export
export default plugin;

// Named exports for flexibility
export { rules };
export const configs = plugin.configs;
