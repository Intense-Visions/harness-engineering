// tests/rules/no-layer-violation-workspace.test.ts
//
// `resolveWorkspacePackages` (#2216 follow-up): with the option on, bare
// workspace-package specifiers (`@scope/pkg`, `@scope/pkg/sub`) resolve to the
// package's source and are checked against the layer config. With it off
// (the default) they are ignored exactly as before.
import { RuleTester } from '@typescript-eslint/rule-tester';
import { describe, it, afterAll, beforeEach } from 'vitest';
import * as path from 'path';
import rule from '../../src/rules/no-layer-violation';
import { clearConfigCache } from '../../src/utils/config-loader';
import { clearWorkspaceCache } from '../../src/utils/workspace-packages';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const ws = path.join(__dirname, '../fixtures/workspace');
const typesFile = path.join(ws, 'packages/types/src/index.ts');
const coreFile = path.join(ws, 'packages/core/src/index.ts');
const cliFile = path.join(ws, 'packages/cli/src/index.ts');
const on = [{ resolveWorkspacePackages: true }] as const;

beforeEach(() => {
  clearConfigCache();
  clearWorkspaceCache();
});

ruleTester.run('no-layer-violation (resolveWorkspacePackages)', rule, {
  valid: [
    // Option OFF (default): a forbidden bare cross-package import is not checked.
    { code: `import { core } from '@fixture-ws/core';`, filename: typesFile },
    // Option explicitly false: same.
    {
      code: `import { core } from '@fixture-ws/core';`,
      filename: typesFile,
      options: [{ resolveWorkspacePackages: false }],
    },
    // Option ON: allowed dependency (core -> types, main: dist -> src twin).
    { code: `import type { Id } from '@fixture-ws/types';`, filename: coreFile, options: on },
    // Option ON: allowed dependency via exports map (cli -> core).
    { code: `import { core } from '@fixture-ws/core';`, filename: cliFile, options: on },
    // Option ON: allowed subpath export (cli -> core/internal).
    {
      code: `import { internal } from '@fixture-ws/core/internal';`,
      filename: cliFile,
      options: on,
    },
    // Option ON: same-layer self import is fine.
    { code: `import { core } from '@fixture-ws/core';`, filename: coreFile, options: on },
    // Option ON: external (non-workspace) packages are still ignored.
    { code: `import lodash from 'lodash';`, filename: typesFile, options: on },
    // Option ON: a package outside the workspace globs is not a member.
    { code: `import { x } from '@fixture-ws/not-a-member';`, filename: typesFile, options: on },
    // Option ON: a subpath the exports map does not declare and has no src twin.
    { code: `import { y } from '@fixture-ws/core/nope';`, filename: typesFile, options: on },
  ],
  invalid: [
    // Option ON: types -> core is forbidden (exports map, dist -> src).
    {
      code: `import { core } from '@fixture-ws/core';`,
      filename: typesFile,
      options: on,
      errors: [{ messageId: 'layerViolation', data: { fromLayer: 'types', toLayer: 'core' } }],
    },
    // Option ON: subpath export resolved to packages/core/src/internal/index.ts.
    {
      code: `import { internal } from '@fixture-ws/core/internal';`,
      filename: typesFile,
      options: on,
      errors: [{ messageId: 'layerViolation', data: { fromLayer: 'types', toLayer: 'core' } }],
    },
    // Option ON: core -> cli is forbidden (no exports/main: src/index fallback).
    {
      code: `import { cli } from '@fixture-ws/cli';`,
      filename: coreFile,
      options: on,
      errors: [{ messageId: 'layerViolation', data: { fromLayer: 'core', toLayer: 'cli' } }],
    },
    // Relative imports keep working with the option on.
    {
      code: `import { cli } from '../../cli/src/index';`,
      filename: coreFile,
      options: on,
      errors: [{ messageId: 'layerViolation', data: { fromLayer: 'core', toLayer: 'cli' } }],
    },
  ],
});
