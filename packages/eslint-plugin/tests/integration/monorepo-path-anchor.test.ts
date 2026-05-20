// tests/integration/monorepo-path-anchor.test.ts
//
// Regression: in monorepos, layer-based rules must use the directory of
// harness.config.json as the path-normalization anchor — not the /src/
// heuristic, which collapses packages/<x>/src/... to src/... and destroys
// package identity. Without the fix, the invalid case below produces zero
// errors because `from: "packages/a/**"` never matches the normalized path.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import forbiddenImports from '../../src/rules/no-forbidden-imports';
import { clearConfigCache } from '../../src/utils/config-loader';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const monorepoDir = path.join(__dirname, '../fixtures/monorepo');

beforeEach(() => {
  clearConfigCache();
});

ruleTester.run('no-forbidden-imports (monorepo path anchor)', forbiddenImports, {
  valid: [
    // package-a importing from itself — not forbidden.
    {
      code: `import { local } from './helper';`,
      filename: path.join(monorepoDir, 'packages/a/src/index.ts'),
    },
    // package-b is unconstrained.
    {
      code: `import * as anything from 'react';`,
      filename: path.join(monorepoDir, 'packages/b/src/index.ts'),
    },
  ],
  invalid: [
    // The regression case: a file at packages/a/src/index.ts importing
    // 'react'. The forbiddenImports rule has `from: "packages/a/**"`.
    // Pre-fix: normalizePath drops 'packages/a' and yields 'src/index.ts',
    // so the rule doesn't fire. Post-fix: project-root anchoring yields
    // 'packages/a/src/index.ts' and the rule fires.
    {
      code: `import React from 'react';`,
      filename: path.join(monorepoDir, 'packages/a/src/index.ts'),
      errors: [{ messageId: 'forbiddenImport' }],
    },
  ],
});
