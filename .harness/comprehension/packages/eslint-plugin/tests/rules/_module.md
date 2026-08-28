---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/rules'
sourceHash: 'e840b91cacc3945c0a06745561f3dc229d9d1fa4c563849e448952afbde321fb'
compiledAt: '2026-08-28T01:22:11.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'enforce-doc-exports.test.ts',
    'no-circular-deps.test.ts',
    'no-disabled-tests.test.ts',
    'no-empty-describe.test.ts',
    'no-focused-tests.test.ts',
    'no-forbidden-imports.test.ts',
    'no-hardcoded-path-separator.test.ts',
    'no-hardcoded-test-count.test.ts',
    'no-layer-violation.test.ts',
    'no-nested-loops-in-critical.test.ts',
    'no-process-env-in-spawn.test.ts',
    'no-process-exit.test.ts',
    'no-skipped-tests.test.ts',
    'no-spread-in-variadic.test.ts',
    'no-sync-io-in-async.test.ts',
    'no-unbounded-array-chains.test.ts',
    'no-undefined-optional-assignment.test.ts',
    'no-unix-shell-command.test.ts',
    'prefer-execfile-over-exec.test.ts',
    'require-boundary-schema.test.ts',
    'require-path-normalization.test.ts',
  ]
---

## Summary

The `packages/eslint-plugin/tests/rules` module is a comprehensive test suite for 20 ESLint rules, organized as individual test files, each validating one rule using RuleTester from `@typescript-eslint/rule-tester`. The rules span six categories: **documentation & exports** (enforce-doc-exports), **architecture & layering** (no-circular-deps, no-layer-violation, no-forbidden-imports), **test quality** (no-disabled-tests, no-empty-describe, no-focused-tests, no-skipped-tests, no-hardcoded-test-count), **path safety** (no-hardcoded-path-separator, require-path-normalization), **performance** (no-nested-loops-in-critical, no-unbounded-array-chains), and **process/async safety** (no-sync-io-in-async, no-process-env-in-spawn, no-process-exit, prefer-execfile-over-exec, no-unix-shell-command).

Each test file follows a consistent pattern: RuleTester callbacks are wired to Vitest (`afterAll`, `describe`, `it`), the rule is imported, and test cases split into `valid` and `invalid` arrays. Valid cases assert the rule should not trigger; invalid cases assert specific `messageId` errors. Configuration-dependent rules (no-layer-violation, no-forbidden-imports) use a `fixtures` directory for setup and clear caches via `beforeEach` to prevent test pollution. Tests verify both simple and complex patterns: direct calls and member expressions (e.g., `spawn()` vs `child_process.spawn()`), nested structures (async functions with sync I/O), and boundary cases (external imports, non-matching patterns). Some rules like `no-circular-deps` expose helper functions (addEdge, detectCycle, clearImportGraph) that are tested alongside the linter rule itself.

## Invariants

- RuleTester Vitest bridging: RuleTester callbacks must be wired to Vitest hooks (e.g., `RuleTester.afterAll = afterAll`) before running any tests
- Error identification by messageId: All error assertions reference `messageId` strings (e.g., `{ messageId: 'forbiddenImport' }`), never literal error messages, to decouple tests from I18n or message text changes
- State cleanup on config-dependent rules: Tests of rules that load configuration (e.g., no-layer-violation, no-forbidden-imports) must call `clearConfigCache()` in `beforeEach` to prevent cross-test pollution
- Fixtures directory structure: Configuration-dependent rules assume fixtures at `../fixtures/` with paths normalized via `path.join(__dirname, '../fixtures', 'src/...')`
- Valid/invalid case completeness: Each rule test must include explicit valid cases for external imports (always allowed), non-matching patterns (different identifiers, different contexts), and patterns the rule should ignore (e.g., URLs, regex literals, import specifiers)
- Nested and edge-case coverage: Tests verify rule behavior on nested structures (nested loops, async within async), both function declaration forms (arrow, expression, declaration), and member vs. direct call patterns
- No spurious rule triggering: Rules that inspect specific contexts (e.g., spawn calls, @perf-critical functions) must be tested to confirm they don't trigger on similar but non-applicable code
- Graph/state fixtures are transient: Rules exposing graph helpers (e.g., `no-circular-deps`) must export cache-clearing functions and tests must call them in `beforeEach` to reset state between cases

## Interface Contract

```ts

```

## Dependency Slice

```
import rule from '../../src/rules/enforce-doc-exports'
import rule, { addEdge, clearImportGraph, detectCycle } from '../../src/rules/no-circular-deps'
import rule from '../../src/rules/no-disabled-tests'
import rule from '../../src/rules/no-empty-describe'
import rule from '../../src/rules/no-focused-tests'
import rule from '../../src/rules/no-forbidden-imports'
import rule from '../../src/rules/no-hardcoded-path-separator'
import rule from '../../src/rules/no-hardcoded-test-count'
import rule from '../../src/rules/no-layer-violation'
import rule from '../../src/rules/no-nested-loops-in-critical'
import rule from '../../src/rules/no-process-env-in-spawn'
import rule from '../../src/rules/no-process-exit'
import rule from '../../src/rules/no-skipped-tests'
import rule from '../../src/rules/no-spread-in-variadic'
import rule from '../../src/rules/no-sync-io-in-async'
import rule from '../../src/rules/no-unbounded-array-chains'
import rule from '../../src/rules/no-undefined-optional-assignment'
import rule from '../../src/rules/no-unix-shell-command'
import rule from '../../src/rules/prefer-execfile-over-exec'
import rule from '../../src/rules/require-boundary-schema'
import rule from '../../src/rules/require-path-normalization'
import { clearConfigCache } from '../../src/utils/config-loader'
import { RuleTester } from '@typescript-eslint/rule-tester'
import * as path from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
```
