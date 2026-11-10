import { defineConfig } from 'vitest/config';

// Root-level tests are split across TWO runners, deliberately (#2212):
//   - vitest (this config, `pnpm test:root`) collects `tests/**/*.test.ts`.
//   - `tests/**/*.test.mjs` is node:test territory: those files are written
//     against `node:test` and run by `node --test 'tests/scripts/*.test.mjs'`
//     in .github/workflows/ci.yml — NOT by vitest.
// Each runner silently reports "no test files found" over the other's files,
// so tests/scripts/test-runner-split.test.mjs pins the split: every .test.mjs
// must be matched by a workflow `node --test` glob, and this include must not
// claim any .test.mjs. Widening the include to .mjs, or adding a .test.mjs
// outside the workflow glob, fails that guard.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
