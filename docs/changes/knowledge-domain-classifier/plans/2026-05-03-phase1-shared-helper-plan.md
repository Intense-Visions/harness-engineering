# Plan: Knowledge Domain Classifier — Phase 1 (Shared Helper)

**Date:** 2026-05-03
**Spec:** `/Users/cwarner/Projects/harness-engineering/docs/changes/knowledge-domain-classifier/proposal.md`
**Session:** `changes--knowledge-domain-classifier--proposal`
**Tasks:** 5
**Time:** ~18 min
**Integration Tier:** small
**Rigor:** standard (skeleton skipped — task count < 8)

## Goal

Extract `inferDomain` from `KnowledgeDocMaterializer` into a pure, configurable shared helper at `packages/graph/src/ingest/domain-inference.ts`, exported from the `@harness-engineering/graph` barrel, with TDD-first unit tests covering all 14 behavioral criteria from proposal Section 5.1.

## Observable Truths (Acceptance Criteria)

This phase delivers behavioral criteria 1-14, 25 (null-on-unknown not yet — that's Phase 2), and the validation slice for what is buildable in isolation:

1. `inferDomain({ path: 'packages/cli/src/foo.ts' })` returns `'cli'`.
2. `inferDomain({ path: 'apps/web/src/index.tsx' })` returns `'web'`.
3. `inferDomain({ path: 'services/api/handler.ts' })` returns `'api'`.
4. `inferDomain({ path: 'src/utils/foo.ts' })` returns `'utils'`.
5. `inferDomain({ path: 'lib/parser.ts' })` returns `'parser'`.
6. `inferDomain({ path: 'agents/skills/foo.ts' }, { extraPatterns: ['agents/<dir>'] })` returns `'skills'`.
7. `inferDomain({ path: 'agents/skills/foo.ts' })` returns `'agents'`.
8. `inferDomain({ path: 'node_modules/foo/index.js' })` returns `'unknown'`.
9. `inferDomain({ path: '.harness/extracted/x.jsonl' })` returns `'unknown'`.
10. `inferDomain({ metadata: { domain: 'explicit' }, path: 'packages/cli/foo.ts' })` returns `'explicit'`.
11. `inferDomain({ metadata: { source: 'knowledge-linker', connectorName: 'jira' } })` returns `'jira'`.
12. `inferDomain({ metadata: { source: 'knowledge-linker' } })` returns `'general'`.
13. `inferDomain({ metadata: { domain: 'foo' } })` returns `'foo'`.
14. `inferDomain({ path: 'unknown-dir/foo.ts' })` returns `'unknown-dir'`.
15. `pnpm --filter @harness-engineering/graph test -- domain-inference` passes 14/14.
16. `inferDomain` and `DomainInferenceOptions` are reachable from `import { inferDomain, type DomainInferenceOptions } from '@harness-engineering/graph'`.
17. `harness validate` passes after the change.

## File Map

```
CREATE packages/graph/src/ingest/domain-inference.ts
CREATE packages/graph/tests/ingest/domain-inference.test.ts
MODIFY packages/graph/src/index.ts        (add barrel export for inferDomain + DomainInferenceOptions)
```

`KnowledgeDocMaterializer.ts:144-168` is **not** modified in Phase 1. The existing private method continues to work. Phase 2 of the parent spec rewires call sites.

## Uncertainties

- **[ASSUMPTION]** Path normalization uses `node:path.posix.normalize` so `\\`-style Windows paths and leading `./` segments do not throw off the prefix match. The existing private `inferDomain` uses raw regex `/^packages\/([^/]+)/` with no normalization; we preserve forward-slash-only matching to avoid behavioral drift.
- **[ASSUMPTION]** Empty-string segments (e.g., `path: '/packages/cli/foo'` with leading slash) split to `['', 'packages', 'cli', 'foo']`; `matchPattern` must skip empty leading segments so `'packages/cli/foo'` and `'/packages/cli/foo'` produce the same result. Test cases will lock this in.
- **[DEFERRABLE]** The `<dir>` placeholder syntax in patterns is matched literally by string split; we are not implementing glob/regex per D8.

## Carry-Forward Concerns (Acknowledge, Do NOT Fix)

- Pre-existing DTS typecheck failures in `graph/ingest.ts`, `knowledge-pipeline.ts`, `mcp/tools/graph/ingest-source.ts`.
- 72% docs coverage baseline (boosted to 98% in prior session via api/ index pages).
- Pre-commit arch hook warnings on unrelated files.

These are tracked in the parent session and **must not** be addressed in this phase.

## Tasks

### Task 1: Write failing unit tests for `inferDomain` (TDD red)

**Depends on:** none
**Files:** `packages/graph/tests/ingest/domain-inference.test.ts`

1. Create `/Users/cwarner/Projects/harness-engineering/packages/graph/tests/ingest/domain-inference.test.ts` with the verbatim test suite below. The import path uses the relative source path (test will fail with module-not-found until Task 2):

   ```ts
   import { describe, it, expect } from 'vitest';
   import { inferDomain } from '../../src/ingest/domain-inference.js';

   describe('inferDomain', () => {
     describe('built-in patterns', () => {
       it('matches packages/<dir> prefix', () => {
         expect(inferDomain({ path: 'packages/cli/src/foo.ts' })).toBe('cli');
       });

       it('matches apps/<dir> prefix', () => {
         expect(inferDomain({ path: 'apps/web/src/index.tsx' })).toBe('web');
       });

       it('matches services/<dir> prefix', () => {
         expect(inferDomain({ path: 'services/api/handler.ts' })).toBe('api');
       });

       it('matches src/<dir> prefix', () => {
         expect(inferDomain({ path: 'src/utils/foo.ts' })).toBe('utils');
       });

       it('matches lib/<dir> prefix', () => {
         expect(inferDomain({ path: 'lib/parser.ts' })).toBe('parser');
       });
     });

     describe('config patterns (extraPatterns)', () => {
       it('config pattern wins over generic fallback', () => {
         expect(
           inferDomain({ path: 'agents/skills/foo.ts' }, { extraPatterns: ['agents/<dir>'] })
         ).toBe('skills');
       });
     });

     describe('generic first-segment fallback', () => {
       it('falls back to first segment when no pattern matches', () => {
         expect(inferDomain({ path: 'agents/skills/foo.ts' })).toBe('agents');
       });

       it('falls back to first segment for unrecognized non-blocklisted top-level', () => {
         expect(inferDomain({ path: 'unknown-dir/foo.ts' })).toBe('unknown-dir');
       });
     });

     describe('blocklist', () => {
       it('returns unknown for node_modules', () => {
         expect(inferDomain({ path: 'node_modules/foo/index.js' })).toBe('unknown');
       });

       it('returns unknown for .harness paths', () => {
         expect(inferDomain({ path: '.harness/extracted/x.jsonl' })).toBe('unknown');
       });
     });

     describe('metadata.domain precedence', () => {
       it('explicit metadata.domain wins over path-based inference', () => {
         expect(
           inferDomain({
             metadata: { domain: 'explicit' },
             path: 'packages/cli/foo.ts',
           })
         ).toBe('explicit');
       });

       it('metadata.domain works even without a path', () => {
         expect(inferDomain({ metadata: { domain: 'foo' } })).toBe('foo');
       });
     });

     describe('KnowledgeLinker connector source (path-less)', () => {
       it('uses connectorName when source is knowledge-linker', () => {
         expect(
           inferDomain({
             metadata: { source: 'knowledge-linker', connectorName: 'jira' },
           })
         ).toBe('jira');
       });

       it("falls back to 'general' when knowledge-linker has no connectorName", () => {
         expect(inferDomain({ metadata: { source: 'knowledge-linker' } })).toBe('general');
       });
     });
   });
   ```

2. Run the test to confirm red:

   ```bash
   pnpm --filter @harness-engineering/graph test -- domain-inference
   ```

   Expect: failure with "Cannot find module" or equivalent. **Do not proceed until you observe the failure.**

3. Do **not** commit yet — Task 2 commits red+green together as a single TDD unit.

---

### Task 2: Implement `inferDomain` shared helper (TDD green)

**Depends on:** Task 1
**Files:** `packages/graph/src/ingest/domain-inference.ts`

1. Create `/Users/cwarner/Projects/harness-engineering/packages/graph/src/ingest/domain-inference.ts` with the verbatim implementation below:

   ```ts
   /**
    * Domain inference for graph nodes.
    *
    * Precedence (highest to lowest):
    *   1. node.metadata.domain (explicit)
    *   2. extraPatterns (config-provided)
    *   3. DEFAULT_PATTERNS (built-in)
    *   4. Generic first non-blocklisted path segment
    *   5. KnowledgeLinker connector source (path-less facts)
    *   6. 'unknown'
    *
    * Pattern format: 'prefix/<dir>'. Single-segment prefix only. <dir> captures
    * the segment immediately after the prefix.
    */

   export interface DomainInferenceOptions {
     /** Additional patterns beyond the built-in defaults. Format: 'prefix/<dir>'. */
     extraPatterns?: readonly string[];
     /** Additional blocklisted segments beyond the built-in defaults. */
     extraBlocklist?: readonly string[];
   }

   export const DEFAULT_PATTERNS: readonly string[] = [
     'packages/<dir>',
     'apps/<dir>',
     'services/<dir>',
     'src/<dir>',
     'lib/<dir>',
   ];

   export const DEFAULT_BLOCKLIST: ReadonlySet<string> = new Set([
     'node_modules',
     '.harness',
     'dist',
     'build',
     '.git',
     'coverage',
     '.next',
     '.turbo',
     '.cache',
     'out',
     'tmp',
   ]);

   /**
    * Match a single pattern of the form 'prefix/<dir>' against a path.
    * Returns the captured `<dir>` segment, or null if no match.
    *
    * Empty leading segments (from leading '/' or './') are skipped so
    * '/packages/cli/foo' and 'packages/cli/foo' produce the same result.
    */
   function matchPattern(filePath: string, pattern: string): string | null {
     const patternParts = pattern.split('/').filter((s) => s.length > 0);
     if (patternParts.length !== 2 || patternParts[1] !== '<dir>') {
       return null;
     }
     const prefix = patternParts[0]!;
     const pathParts = filePath.split('/').filter((s) => s.length > 0);
     if (pathParts.length < 2) return null;
     if (pathParts[0] !== prefix) return null;
     const dir = pathParts[1]!;
     if (dir.length === 0) return null;
     return dir;
   }

   export function inferDomain(
     node: { path?: string; metadata?: Record<string, unknown> },
     options: DomainInferenceOptions = {}
   ): string {
     // 1. Explicit metadata.domain wins.
     if (
       node.metadata?.domain &&
       typeof node.metadata.domain === 'string' &&
       node.metadata.domain.length > 0
     ) {
       return node.metadata.domain;
     }

     const filePath = typeof node.path === 'string' ? node.path : '';

     // Build effective blocklist (defaults + extraBlocklist).
     const blocklist = new Set<string>(DEFAULT_BLOCKLIST);
     if (options.extraBlocklist) {
       for (const seg of options.extraBlocklist) {
         if (seg && seg.length > 0) blocklist.add(seg);
       }
     }

     if (filePath.length > 0) {
       // 2. extraPatterns first (config wins over built-ins).
       const extraPatterns = options.extraPatterns ?? [];
       for (const pattern of extraPatterns) {
         const dir = matchPattern(filePath, pattern);
         if (dir !== null && !blocklist.has(dir)) return dir;
       }

       // 3. Built-in patterns.
       for (const pattern of DEFAULT_PATTERNS) {
         const dir = matchPattern(filePath, pattern);
         if (dir !== null && !blocklist.has(dir)) return dir;
       }

       // 4. Generic first-segment fallback (after blocklist filter).
       const segments = filePath.split('/').filter((s) => s.length > 0);
       for (const seg of segments) {
         if (!blocklist.has(seg)) return seg;
       }
     }

     // 5. KnowledgeLinker connector source (path-less facts).
     const source = node.metadata?.source;
     if (source === 'knowledge-linker' || source === 'connector') {
       const connector = node.metadata?.connectorName;
       if (typeof connector === 'string' && connector.length > 0) return connector;
       return 'general';
     }

     // 6. Final fallback.
     return 'unknown';
   }
   ```

2. Run the test to confirm green:

   ```bash
   pnpm --filter @harness-engineering/graph test -- domain-inference
   ```

   Expect: 14/14 passing. If any fail, debug before continuing — do not skip or weaken tests.

3. Run validation:

   ```bash
   harness validate
   ```

4. Commit (red + green together — both files staged):

   ```bash
   git add packages/graph/src/ingest/domain-inference.ts packages/graph/tests/ingest/domain-inference.test.ts
   git commit -m "feat(graph): add shared inferDomain helper with TDD coverage

   Extract path-based domain inference into a pure, configurable helper at
   packages/graph/src/ingest/domain-inference.ts. Covers built-in patterns
   (packages/, apps/, services/, src/, lib/), reserved blocklist
   (node_modules, .harness, dist, etc.), generic first-segment fallback,
   metadata.domain precedence, and KnowledgeLinker connector-source path.

   Phase 1 of knowledge-domain-classifier. Wiring at existing call sites
   (KnowledgeStagingAggregator, CoverageScorer, KnowledgeDocMaterializer)
   is deferred to Phase 2.

   Refs: docs/changes/knowledge-domain-classifier/proposal.md"
   ```

---

### Task 3: Export from `@harness-engineering/graph` barrel

**Depends on:** Task 2
**Files:** `packages/graph/src/index.ts`

1. Open `/Users/cwarner/Projects/harness-engineering/packages/graph/src/index.ts`. Locate the "// Ingest" section (around line 43-52). After the existing `RequirementIngestor` export (line 52), append:

   ```ts
   export { inferDomain, DEFAULT_PATTERNS, DEFAULT_BLOCKLIST } from './ingest/domain-inference.js';
   export type { DomainInferenceOptions } from './ingest/domain-inference.js';
   ```

   Place these two lines immediately before the blank line preceding `// Knowledge Pipeline`. Do not modify any other exports.

2. Verify barrel typechecks and tests still pass:

   ```bash
   pnpm --filter @harness-engineering/graph test -- domain-inference
   ```

   Expect: 14/14 still passing.

3. Verify the symbol is reachable from the package root by writing a temporary smoke check (do **not** commit this file):

   ```bash
   node --input-type=module -e "import('./packages/graph/dist/index.js').then(m => { console.log('inferDomain' in m ? 'OK' : 'MISSING'); }).catch(e => { console.log('NEEDS_BUILD'); })"
   ```

   If this prints `NEEDS_BUILD`, that's expected — dist isn't refreshed. Skip this step if dist isn't built; the static export in `index.ts` is sufficient evidence.

4. Run validation:

   ```bash
   harness validate
   ```

5. Commit:

   ```bash
   git add packages/graph/src/index.ts
   git commit -m "feat(graph): export inferDomain and DomainInferenceOptions from barrel

   Make the shared domain-inference helper reachable via
   import { inferDomain, type DomainInferenceOptions } from
   '@harness-engineering/graph'.

   Phase 1 of knowledge-domain-classifier (continuation).

   Refs: docs/changes/knowledge-domain-classifier/proposal.md"
   ```

---

### Task 4: Verify full graph test suite has no regressions

**Depends on:** Task 3
**Files:** none (verification only)

1. Run the full graph test suite:

   ```bash
   pnpm --filter @harness-engineering/graph test
   ```

   Expect: all suites pass, including the new `domain-inference` suite (14/14) and existing suites (`KnowledgeDocMaterializer.test.ts`, `KnowledgeStagingAggregator.test.ts`, `CoverageScorer.test.ts`, etc.).

2. If any unrelated suite fails, that is a carry-forward concern — record it in the handoff `concerns` array and do **not** attempt to fix it in this phase.

3. Run final validation:

   ```bash
   harness validate
   harness check-deps
   ```

   Both must pass. Carry-forward DTS typecheck failures and arch warnings on unrelated files are acceptable per the session brief.

4. No commit — this is a verification-only task.

---

### Task 5: `[checkpoint:human-verify]` Confirm Phase 1 ready for handoff to Phase 2

**Depends on:** Task 4
**Files:** none

1. Show the operator (or autopilot) the following summary:
   - File created: `packages/graph/src/ingest/domain-inference.ts` (~95 lines, pure functions, no I/O)
   - Test created: `packages/graph/tests/ingest/domain-inference.test.ts` (14 tests, all green)
   - Barrel export updated: `packages/graph/src/index.ts` (+2 lines)
   - `KnowledgeDocMaterializer.ts:144-168` **untouched** (Phase 2 work)
   - Acceptance criteria 1-14 covered; criteria 15-31 deferred to subsequent phases.

2. Wait for confirmation before transitioning to harness-execution for Phase 2.

3. No commit — this is a checkpoint.

---

## Sequencing & Parallelism

- All tasks are strictly sequential (Task N depends on Task N-1).
- No parallel opportunities in Phase 1 — small, linear scope.
- Estimated total: ~18 minutes (Task 1: 4 min, Task 2: 6 min, Task 3: 3 min, Task 4: 3 min, Task 5: 2 min).

## Validation Gates

- `harness validate` runs at end of Tasks 2, 3, and 4.
- `harness check-deps` runs at end of Task 4.
- TDD-red observed in Task 1 before TDD-green in Task 2.
- Full graph test suite verified in Task 4.
- Human-verify checkpoint in Task 5 before downstream invocation.

## Out of Scope (Deferred to Later Phases)

- Phase 2: rewire `KnowledgeDocMaterializer.inferDomain`, `KnowledgeStagingAggregator.ts:163`, `CoverageScorer.ts:68` to use the shared helper.
- Phase 3: add `knowledge.domainPatterns` and `knowledge.domainBlocklist` to `packages/cli/src/config/schema.ts`.
- Phase 4: thread `inferenceOptions` through `KnowledgePipelineRunner` to constructors.
- Phase 5: docs updates (`configuration.md`, `node-edge-taxonomy.md`).
- Phase 6: end-to-end pipeline verification on this repo.

## Skill Annotations

The skills surfaced by the advisor (`ts-zod-integration`, `ts-utility-types`, `ts-testing-types`, etc.) are reference-tier and do not directly apply to this phase — the helper is a small pure function with no zod schema, no advanced TS utility types, and no novel testing patterns. Standard vitest assertions and plain TypeScript interfaces are sufficient. No skill annotations on individual tasks.
