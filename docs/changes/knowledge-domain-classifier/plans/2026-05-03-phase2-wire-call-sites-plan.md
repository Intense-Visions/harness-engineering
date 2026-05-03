# Plan: Phase 2 — Wire `inferDomain` into existing call sites

**Date:** 2026-05-03 | **Spec:** `docs/changes/knowledge-domain-classifier/proposal.md` | **Phase 1 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase1-shared-helper-plan.md` | **Tasks:** 8 | **Time:** ~28 min | **Integration Tier:** medium

## Goal

Replace the bespoke domain-resolution logic in `KnowledgeDocMaterializer`, `KnowledgeStagingAggregator`, and `CoverageScorer` with the shared `inferDomain(node, options)` helper that landed in Phase 1, while preserving every public contract (return types, fallback semantics, constructor compatibility).

## Observable Truths (Acceptance Criteria)

The following are derived from `proposal.md` Success Criteria sections "Aggregator Integration", "Backward Compatibility", and "Validation". Phase 2 is a refactor — it must hold these invariants without behavioural regressions.

1. **[Ubiquitous]** The system shall have exactly one definition of domain-inference logic (the shared helper at `packages/graph/src/ingest/domain-inference.ts`); the three call-site files contain no path-pattern, blocklist, or `'unknown'` fallback logic of their own.
2. **[Event-driven]** When `KnowledgeDocMaterializer.inferDomain(node)` is invoked, the system shall return the same value the shared helper would produce, except `'unknown'` is mapped to `null` (preserving the `no_domain` skip-reason contract for `processNode`).
3. **[Event-driven]** When `KnowledgeStagingAggregator.generateGapReport` groups extracted nodes by domain, the system shall use `inferDomain(node, this.inferenceOptions)` instead of the literal `'unknown'` fallback, with no other change to gap-grouping behaviour.
4. **[Event-driven]** When `CoverageScorer.score` groups code nodes by domain (and knowledge nodes when their metadata is missing), the system shall delegate to `inferDomain(node, this.inferenceOptions)` instead of the legacy `fallback(node)` argument and `domainFromPath(node.path)` private method.
5. **[Optional]** Where a caller constructs `KnowledgeDocMaterializer`, `KnowledgeStagingAggregator`, or `CoverageScorer` without `inferenceOptions`, the system shall default to `{}` and produce identical inference behaviour to passing `{}` explicitly.
6. **[Unwanted]** If callers still pass the legacy `fallback` parameter (only relevant to internal usage of `groupByDomain` inside `CoverageScorer.ts`), the system shall not throw — the parameter is ignored and marked `@deprecated`.
7. **[Ubiquitous]** The system shall keep `KnowledgeDocMaterializer.inferDomain`'s return type as `string | null` (callers special-case `null` → `'no_domain'`).
8. **[Ubiquitous]** Running `pnpm --filter @harness-engineering/graph test` shall produce 0 regressions versus Phase 1 baseline (815/815 passing).
9. **[Ubiquitous]** Running `harness validate` shall pass.
10. **[Ubiquitous]** Running `harness check-deps` shall pass.

## Skill Annotations

From `docs/changes/knowledge-domain-classifier/SKILLS.md` (Reference tier — none in Apply tier). Most skills are weak matches (~0.5); annotated where directly relevant.

## File Map

```
MODIFY  packages/graph/src/ingest/KnowledgeDocMaterializer.ts          (replace inferDomain method body, add constructor param)
MODIFY  packages/graph/src/ingest/KnowledgeStagingAggregator.ts        (replace 'unknown' fallback at L163, add constructor param)
MODIFY  packages/graph/src/ingest/CoverageScorer.ts                    (replace fallback+domainFromPath, add constructor param, deprecate fallback arg)
```

No new files. No test files modified or created — Phase 1 helper tests already cover behavioural correctness, and existing call-site tests continue to assert externally-observable behaviour that is preserved by this refactor (see Test Impact Assessment below).

## Skeleton

_Skeleton produced (rigor: standard; task count = 8 = threshold)._

1. Refactor `KnowledgeDocMaterializer` (~2 tasks, ~7 min) — wrap shared helper with `null`-on-`'unknown'` and add constructor param.
2. Refactor `KnowledgeStagingAggregator` (~2 tasks, ~7 min) — replace string fallback at line 163, import helper, add constructor param.
3. Refactor `CoverageScorer` (~2 tasks, ~8 min) — replace `groupByDomain(fallback)` with shared helper, deprecate fallback param, drop now-dead `domainFromPath`.
4. Verification (~2 tasks, ~6 min) — run full graph suite, run `harness validate` + `harness check-deps`, optional human-verify.

**Estimated total:** 8 tasks, ~28 minutes.

_Skeleton AUTO-APPROVED via session header._

## Uncertainties

- **[ASSUMPTION]** `KnowledgePipelineRunner` already constructs all three classes with single-argument calls (`new KnowledgeStagingAggregator(options.projectDir)` etc.). Confirmed via grep at lines 328, 369, 403, 112 of `KnowledgePipelineRunner.ts`. Adding optional second/third arg with default `= {}` is non-breaking.
- **[ASSUMPTION]** No external `@harness-engineering/graph` consumer currently subclasses these three classes. No `extends KnowledgeStagingAggregator` etc. found in repo.
- **[ASSUMPTION]** `groupByDomain` in `CoverageScorer.ts` is module-private (not exported). Verified — only used internally within `CoverageScorer.score()`.
- **[ASSUMPTION]** The existing `KnowledgeDocMaterializer.test.ts:104` "skips nodes with unresolvable domain" test (node has `metadata: { source: 'extractor' }`, no path) continues to skip with `no_domain` reason. With the new helper: `metadata.domain` is undefined, `path` is undefined, `source !== 'knowledge-linker'`/`'connector'`, so helper returns `'unknown'` → wrapper returns `null` → `processNode` returns `no_domain`. Behaviour preserved.
- **[ASSUMPTION]** The existing `KnowledgeDocMaterializer.test.ts:325` "infers domain from node path when metadata.domain is absent" test (`path: 'packages/billing/src/invoices.ts'`) continues to resolve to `'billing'` and create the doc. With the new helper: `DEFAULT_PATTERNS` includes `packages/<dir>` → `'billing'`. Helper returns `'billing'`, wrapper returns `'billing'` (not null). Behaviour preserved.
- **[ASSUMPTION]** The existing `CoverageScorer.test.ts:303` "derives domain from path when metadata.domain is absent" test (code node with `path: 'packages/billing/src/processor.ts'`) continues to resolve to `'billing'`. Helper returns `'billing'`. Behaviour preserved.
- **[DEFERRABLE]** Phase 4 wires `harness.config.json` → `KnowledgePipelineRunner` → these constructors' `inferenceOptions`. Phase 2 just exposes the parameter.
- **[DEFERRABLE]** Carry-forward concerns from Phase 1 review (S3-S5): pre-existing DTS typecheck failures, 72% docs coverage baseline, pre-commit arch hook warnings, stale `graph/dist`. Not addressed in Phase 2.

## Test Impact Assessment

**Tests inspected:**

| Test file                                         | Search for `'unknown'`                                 | Search for `unclassified` | Search for `domain`-related assertions                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/ingest/KnowledgeDocMaterializer.test.ts`   | none                                                   | none                      | only explicit-`metadata.domain` cases + 1 `path: 'packages/billing/...'` case + 1 `metadata: { source: 'extractor' }` no-path case              |
| `tests/ingest/KnowledgeStagingAggregator.test.ts` | none                                                   | none                      | gap-report tests use directory listing, no node-level domain inference                                                                          |
| `tests/ingest/CoverageScorer.test.ts`             | none                                                   | none                      | all knowledge nodes set explicit `metadata.domain`; one code-node case uses `path: 'packages/billing/src/processor.ts'` and asserts `'billing'` |
| `tests/integration/knowledge-pipeline.test.ts`    | one match — refers to a `source` field, **not** domain | none                      | n/a — does not exercise domain-fallback behaviour                                                                                               |

**Conclusion:** No test currently asserts that an unresolvable node lands under the literal string `'unknown'` (KnowledgeStagingAggregator) or `'unclassified'` (CoverageScorer knowledge-node groupBy). All explicit-metadata cases are preserved by precedence rule 1 of the helper. All path-based cases (`packages/<dir>`, `src/<dir>`) are preserved by `DEFAULT_PATTERNS`. The single no-path-no-metadata-no-linker-source case in `KnowledgeDocMaterializer.test.ts` ("Orphan Node") still resolves to `null` via the wrapper.

**Risk:** A node with `metadata: { source: 'extractor' }` (not `'knowledge-linker'`) and a non-empty `path` whose first segment is non-blocklisted would previously have fallen through `KnowledgeDocMaterializer.inferDomain`'s logic (`packages/`/`src/` regex → no match → `source !== 'knowledge-linker'` branch → `null`). The new helper would return the first path segment instead. **No existing test exercises this case** — but it changes runtime behaviour for the materializer: a node with `path: 'agents/skills/foo.ts'` and `metadata.source: 'extractor'` now materializes under `agents/` instead of being skipped with `no_domain`. This is the **explicit goal of the spec** (Section "Goal" bullet 3, Decision D5, Behavioural Criterion #14). Recording as deliberate.

**Action:** No test changes required. If the materializer behaviour change above is judged surprising during review, surface it via Phase 2 exit checkpoint.

## Tasks

---

### Task 1: Refactor `KnowledgeDocMaterializer` — replace `inferDomain` body and add `inferenceOptions`

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgeDocMaterializer.ts` | **Skills:** `ts-utility-types` (reference)

1. Read current `packages/graph/src/ingest/KnowledgeDocMaterializer.ts` to confirm lines 144–168 match the diff below.
2. Add the import at the top of the imports section. Find:

   ```ts
   import type { GraphNode, NodeType } from '../types.js';
   import type { GraphStore } from '../store/GraphStore.js';
   import type { GapEntry } from './KnowledgeStagingAggregator.js';
   ```

   Replace with:

   ```ts
   import type { GraphNode, NodeType } from '../types.js';
   import type { GraphStore } from '../store/GraphStore.js';
   import type { GapEntry } from './KnowledgeStagingAggregator.js';
   import {
     inferDomain as inferDomainShared,
     type DomainInferenceOptions,
   } from './domain-inference.js';
   ```

   (Aliased local import name avoids collision with the public method `inferDomain` on the class.)

3. Replace the constructor:

   ```ts
   // BEFORE (line 64)
   constructor(private readonly store: GraphStore) {}

   // AFTER
   constructor(
     private readonly store: GraphStore,
     private readonly inferenceOptions: DomainInferenceOptions = {}
   ) {}
   ```

4. Replace the `inferDomain` method body (lines 144–168) with a one-liner wrapper that preserves the `null`-on-`'unknown'` contract:

   ```ts
   // BEFORE
   inferDomain(node: GraphNode): string | null {
     // Check metadata.domain first
     if (node.metadata?.domain && typeof node.metadata.domain === 'string') {
       return node.metadata.domain;
     }

     // Check path for packages/{name} or src/{name}
     if (node.path) {
       const pkgMatch = node.path.match(/^packages\/([^/]+)/);
       if (pkgMatch) return pkgMatch[1]!;

       const srcMatch = node.path.match(/^src\/([^/]+)/);
       if (srcMatch) return srcMatch[1]!;
     }

     // KnowledgeLinker-produced facts have metadata.source but no path —
     // derive domain from connectorName or fall back to 'general'
     if (node.metadata?.source === 'knowledge-linker' || node.metadata?.source === 'connector') {
       const connector = node.metadata.connectorName;
       if (typeof connector === 'string') return connector;
       return 'general';
     }

     return null;
   }

   // AFTER
   inferDomain(node: GraphNode): string | null {
     const result = inferDomainShared(node, this.inferenceOptions);
     return result === 'unknown' ? null : result;
   }
   ```

5. Save. Verify the file compiles by running:

   ```bash
   pnpm --filter @harness-engineering/graph build 2>&1 | tail -20
   ```

   Expect no new errors. Pre-existing DTS typecheck warnings on unrelated files (carry-forward concern) are expected and acceptable.

6. Run the targeted test suite:

   ```bash
   pnpm --filter @harness-engineering/graph test -- KnowledgeDocMaterializer
   ```

   Expect all tests pass (specifically: "skips nodes with unresolvable domain" still produces `no_domain` reason; "infers domain from node path when metadata.domain is absent" still resolves to `'billing'`).

7. Run `harness validate`. Expect PASS.
8. Commit:

   ```
   refactor(graph): wire shared inferDomain into KnowledgeDocMaterializer

   Replaces the private path-regex + linker-source branch in
   KnowledgeDocMaterializer.inferDomain with a one-line delegation to the
   shared helper at ingest/domain-inference.ts, preserving the null-on-
   'unknown' contract that callers (processNode → no_domain skip-reason)
   depend on. Constructor gains an optional inferenceOptions parameter
   (default {}) so Phase 4 can plumb harness.config.json patterns/blocklist
   through without further breaking change.

   Phase 2 of knowledge-domain-classifier (proposal.md, plan
   2026-05-03-phase2-wire-call-sites).
   ```

---

### Task 2: Refactor `KnowledgeStagingAggregator` — replace `'unknown'` fallback at line 163

**Depends on:** Task 1 | **Files:** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts` | **Skills:** `ts-utility-types` (reference)

1. Add the import alongside the existing imports near the top of the file. Find:

   ```ts
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import type { NodeType } from '../types.js';
   import type { GraphStore } from '../store/GraphStore.js';
   ```

   Replace with:

   ```ts
   import * as fs from 'node:fs/promises';
   import * as path from 'node:path';
   import type { NodeType } from '../types.js';
   import type { GraphStore } from '../store/GraphStore.js';
   import { inferDomain, type DomainInferenceOptions } from './domain-inference.js';
   ```

2. Replace the constructor (line 68):

   ```ts
   // BEFORE
   export class KnowledgeStagingAggregator {
     constructor(private readonly projectDir: string) {}

   // AFTER
   export class KnowledgeStagingAggregator {
     constructor(
       private readonly projectDir: string,
       private readonly inferenceOptions: DomainInferenceOptions = {}
     ) {}
   ```

3. Replace the fallback at line 163 inside `generateGapReport`:

   ```ts
   // BEFORE (lines 159–168 after constructor change)
   const extractedByDomain = new Map<string, import('../types.js').GraphNode[]>();
   for (const nodeType of BUSINESS_NODE_TYPES) {
     const nodes = store.findNodes({ type: nodeType });
     for (const node of nodes) {
       const domain = (node.metadata?.domain as string) ?? 'unknown';
       const list = extractedByDomain.get(domain) ?? [];
       list.push(node);
       extractedByDomain.set(domain, list);
     }
   }

   // AFTER
   const extractedByDomain = new Map<string, import('../types.js').GraphNode[]>();
   for (const nodeType of BUSINESS_NODE_TYPES) {
     const nodes = store.findNodes({ type: nodeType });
     for (const node of nodes) {
       const domain = inferDomain(node, this.inferenceOptions);
       const list = extractedByDomain.get(domain) ?? [];
       list.push(node);
       extractedByDomain.set(domain, list);
     }
   }
   ```

   Note: explicit `metadata.domain` is still honoured because it is precedence rule 1 of the shared helper. Behaviour for nodes with explicit domain is unchanged. Behaviour for nodes without explicit domain improves from "all bucketed under literal `'unknown'`" to "bucketed under inferred path-based domain" — this is the spec's primary outcome.

4. Save. Verify build:

   ```bash
   pnpm --filter @harness-engineering/graph build 2>&1 | tail -20
   ```

5. Run targeted tests:

   ```bash
   pnpm --filter @harness-engineering/graph test -- KnowledgeStagingAggregator
   ```

   Expect 6/6 passing. The `gaps.md` directory-listing tests don't exercise node-level inference; they remain green.

6. Run `harness validate`. Expect PASS.
7. Commit:

   ```
   refactor(graph): wire shared inferDomain into KnowledgeStagingAggregator

   Replaces the literal 'unknown' fallback at
   KnowledgeStagingAggregator.ts:163 (where business_* nodes were grouped
   by metadata.domain) with a delegation to the shared inferDomain helper.
   Constructor gains optional inferenceOptions (default {}) for Phase 4
   config plumbing.

   This is the primary fix for proposal.md issue #1: 7,500/7,621 entries
   landing in 'unknown'. Per-domain coverage grades become meaningful on
   the next pipeline run.

   Phase 2 of knowledge-domain-classifier.
   ```

---

### Task 3: Refactor `CoverageScorer` — replace `fallback` and `domainFromPath`, deprecate fallback param

**Depends on:** Task 2 | **Files:** `packages/graph/src/ingest/CoverageScorer.ts` | **Skills:** `ts-utility-types` (reference)

1. Add the import. Find:

   ```ts
   import type { GraphStore } from '../store/GraphStore.js';
   import type { EdgeType, GraphNode, NodeType } from '../types.js';
   import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';
   ```

   Replace with:

   ```ts
   import type { GraphStore } from '../store/GraphStore.js';
   import type { EdgeType, GraphNode, NodeType } from '../types.js';
   import { KNOWLEDGE_NODE_TYPES } from './knowledgeTypes.js';
   import { inferDomain, type DomainInferenceOptions } from './domain-inference.js';
   ```

2. Update the `groupByDomain` helper signature: keep `fallback` as `@deprecated` optional (tolerate existing internal callers but ignore in favour of `inferDomain`). Find:

   ```ts
   // --- Helpers (module-level) ---

   /** Group nodes by domain, using a fallback resolver for nodes without explicit domain metadata. */
   function groupByDomain(
     nodes: readonly GraphNode[],
     fallback: (node: GraphNode) => string
   ): Map<string, GraphNode[]> {
     const map = new Map<string, GraphNode[]>();
     for (const node of nodes) {
       const domain = (node.metadata.domain as string) ?? fallback(node);
       const group = map.get(domain) ?? [];
       group.push(node);
       map.set(domain, group);
     }
     return map;
   }
   ```

   Replace with:

   ```ts
   // --- Helpers (module-level) ---

   /**
    * Group nodes by domain. Domain resolution delegates to the shared
    * `inferDomain` helper, which honours `metadata.domain` first and falls
    * back to path-based / config-pattern / built-in-pattern resolution.
    *
    * @param fallback Deprecated. Ignored. Retained as an optional positional
    *   parameter for source-level back-compat with callers that still pass it.
    *   Will be removed in a future release. Use `options.extraPatterns` /
    *   `options.extraBlocklist` instead.
    */
   function groupByDomain(
     nodes: readonly GraphNode[],
     /** @deprecated Ignored. */ _fallback?: (node: GraphNode) => string,
     options: DomainInferenceOptions = {}
   ): Map<string, GraphNode[]> {
     const map = new Map<string, GraphNode[]>();
     for (const node of nodes) {
       const domain = inferDomain(node, options);
       const group = map.get(domain) ?? [];
       group.push(node);
       map.set(domain, group);
     }
     return map;
   }
   ```

   Notes:
   - The legacy `fallback` argument is renamed to `_fallback` (TypeScript convention for "intentionally unused") and marked optional + `@deprecated`.
   - A new third positional argument `options: DomainInferenceOptions` accepts inference config.
   - Callers passing two arguments (the legacy shape) keep compiling; their `fallback` is silently ignored.

3. Update the `CoverageScorer` class. Find:

   ```ts
   // --- Scorer ---

   export class CoverageScorer {
     score(store: GraphStore): CoverageReport {
       const knowledgeNodes = KNOWLEDGE_TYPES.flatMap((t) => store.findNodes({ type: t }));
       const domainMap = groupByDomain(knowledgeNodes, () => 'unclassified');

       const codeNodes = CODE_TYPES.flatMap((t) => store.findNodes({ type: t }));
       const codeDomains = groupByDomain(codeNodes, (n) => this.domainFromPath(n.path));

       const allDomains = new Set([...domainMap.keys(), ...codeDomains.keys()]);
       const domains: DomainCoverageScore[] = [];

       for (const domain of allDomains) {
         domains.push(
           scoreDomain(domain, domainMap.get(domain) ?? [], codeDomains.get(domain) ?? [], store)
         );
       }

       const overallScore =
         domains.length > 0
           ? Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length)
           : 0;

       return {
         domains,
         overallScore,
         overallGrade: toGrade(overallScore),
         generatedAt: new Date().toISOString(),
       };
     }

     private domainFromPath(filePath?: string): string {
       if (!filePath) return 'unclassified';
       const parts = filePath.split('/');
       const pkgIdx = parts.indexOf('packages');
       if (pkgIdx >= 0 && parts[pkgIdx + 1]) return parts[pkgIdx + 1]!;
       const srcIdx = parts.indexOf('src');
       if (srcIdx >= 0 && parts[srcIdx + 1]) return parts[srcIdx + 1]!;
       return parts[0] ?? 'unclassified';
     }
   }
   ```

   Replace with:

   ```ts
   // --- Scorer ---

   export class CoverageScorer {
     constructor(private readonly inferenceOptions: DomainInferenceOptions = {}) {}

     score(store: GraphStore): CoverageReport {
       const knowledgeNodes = KNOWLEDGE_TYPES.flatMap((t) => store.findNodes({ type: t }));
       const domainMap = groupByDomain(knowledgeNodes, undefined, this.inferenceOptions);

       const codeNodes = CODE_TYPES.flatMap((t) => store.findNodes({ type: t }));
       const codeDomains = groupByDomain(codeNodes, undefined, this.inferenceOptions);

       const allDomains = new Set([...domainMap.keys(), ...codeDomains.keys()]);
       const domains: DomainCoverageScore[] = [];

       for (const domain of allDomains) {
         domains.push(
           scoreDomain(domain, domainMap.get(domain) ?? [], codeDomains.get(domain) ?? [], store)
         );
       }

       const overallScore =
         domains.length > 0
           ? Math.round(domains.reduce((sum, d) => sum + d.score, 0) / domains.length)
           : 0;

       return {
         domains,
         overallScore,
         overallGrade: toGrade(overallScore),
         generatedAt: new Date().toISOString(),
       };
     }
   }
   ```

   Notes:
   - The previously-private `domainFromPath` method is removed entirely. Its logic (`packages/<name>` and `src/<name>`) is a strict subset of `DEFAULT_PATTERNS` in the shared helper, so behavioural-equivalent. The fallback `'unclassified'` is replaced by the shared helper's `'unknown'` — see Behaviour Delta below.
   - The literal `'unclassified'` string used in the previous knowledge-node fallback (`groupByDomain(knowledgeNodes, () => 'unclassified')`) likewise becomes `'unknown'`. This is observable only when a knowledge node has no `metadata.domain` AND no usable path — currently no tests cover that combination.
   - Constructor accepts optional `DomainInferenceOptions` with default `{}`. Existing call site in `KnowledgePipelineRunner.ts:112` (`new CoverageScorer().score(this.store)`) keeps compiling.

4. Save. Verify build:

   ```bash
   pnpm --filter @harness-engineering/graph build 2>&1 | tail -20
   ```

5. Run targeted tests:

   ```bash
   pnpm --filter @harness-engineering/graph test -- CoverageScorer
   ```

   Expect all `CoverageScorer.test.ts` cases pass. Specifically:
   - `'derives domain from path when metadata.domain is absent'` (line 303) — code node with `path: 'packages/billing/src/processor.ts'` → `inferDomain` returns `'billing'` (matches `DEFAULT_PATTERNS[0]`). Test expectation: `findDomain(report, 'billing')` is defined with `codeEntities: 1`. PASSES.
   - All other tests use explicit `metadata: { domain }` → precedence rule 1 returns the explicit domain unchanged. PASS.

6. Run `harness validate`. Expect PASS.
7. Commit:

   ```
   refactor(graph): wire shared inferDomain into CoverageScorer

   Replaces the private domainFromPath helper and the inline 'unclassified'
   fallback in groupByDomain with a delegation to the shared inferDomain
   helper. Removes domainFromPath entirely (its logic is a strict subset
   of DEFAULT_PATTERNS in the shared helper). Constructor gains optional
   inferenceOptions (default {}).

   The legacy `fallback` parameter on the module-level groupByDomain helper
   is retained as an optional/ignored positional arg with a @deprecated
   JSDoc annotation, to avoid a breaking source-level change for anyone
   calling groupByDomain directly. It will be removed in a future release.

   Behaviour delta: nodes that previously fell into 'unclassified' now
   land in 'unknown' (the shared helper's final fallback). No existing
   test exercises this case; both buckets serve the same UX purpose
   (visible bucket-of-last-resort in coverage report). If 'unclassified'
   is preferred for the report, a follow-up can rename in the report
   formatter.

   Phase 2 of knowledge-domain-classifier.
   ```

---

### Task 4: Run full graph test suite — no regressions

**Depends on:** Task 3 | **Files:** none

1. From the repo root, run the full graph package test suite:

   ```bash
   pnpm --filter @harness-engineering/graph test 2>&1 | tail -40
   ```

2. Expected outcome: all suites pass. Phase 1 baseline was 815/815. Phase 2 should still be 815/815 (no test additions or deletions).

3. If any test fails, **stop**. Do not commit further. Diagnose:
   - If a `CoverageScorer` test fails on a `'unclassified'` assertion: tighten the deprecation by reverting to `'unclassified'` in the report formatter rather than the inference helper. (No tests assert on `'unclassified'` per Test Impact Assessment, so this is unlikely.)
   - If a `KnowledgeDocMaterializer` test fails on a `no_domain` skip: the wrapper isn't translating `'unknown'` → `null` correctly. Re-check Task 1 step 4.
   - If a `KnowledgeStagingAggregator` test fails on a `'unknown'`-bucket assertion: a previously-implicit assumption was missed. Update the test to use the shared helper's behaviour (this is the spec's intended outcome).

4. No commit (verification-only task).

---

### Task 5: Run `harness validate` and `harness check-deps`

**Depends on:** Task 4 | **Files:** none

1. Run:

   ```bash
   harness validate 2>&1
   harness check-deps 2>&1
   ```

2. Expect both PASS.
3. If `check-deps` flags a new layer/import-direction violation, the wiring introduced a forbidden dependency edge. Inspect the new `import` lines in Tasks 1–3; all three import from the **same package's** `./domain-inference.js` — there should be no cross-package or upward-layer violation. If one is reported, it's likely a stale graph snapshot — re-run after `pnpm --filter @harness-engineering/graph build`.
4. No commit.

---

### Task 6: Verify `KnowledgePipelineRunner` integration is not broken

**Depends on:** Task 5 | **Files:** none

1. Run the integration test suite:

   ```bash
   pnpm --filter @harness-engineering/graph test -- knowledge-pipeline.test.ts 2>&1 | tail -30
   ```

2. Expect all integration tests pass. The `KnowledgePipelineRunner` constructs the three classes with single-argument calls; the new optional `inferenceOptions` default `{}` preserves that compilation/behaviour.

3. No commit.

---

### Task 7: Optional — observe per-domain shift on this repo

**Depends on:** Task 6 | **Files:** `.harness/knowledge/gaps.md` (read-only inspection — no commit)

This is a **diagnostic task**, not a verification gate. Skip if pipeline is slow on this repo (the spec defers full pipeline verification to Phase 6).

1. Capture the current `unknown` row count from `.harness/knowledge/gaps.md` (Phase 1 baseline):

   ```bash
   git show HEAD:.harness/knowledge/gaps.md 2>/dev/null | grep -E '^\| unknown' || echo "no baseline gaps.md in HEAD"
   ```

2. (Optional) Run the pipeline:

   ```bash
   harness knowledge-pipeline 2>&1 | tail -20
   ```

   This may take several minutes on this repo. Skip if running tight on context.

3. Inspect the new `gaps.md`. The `unknown` row should drop substantially (proposal.md projects 7,500 → <100). This is a Phase 6 success criterion (#15) but provides early signal here.

4. **Do not commit** any updated `gaps.md` in this task — `.harness/knowledge/` is gitignored or session-local on most setups, and Phase 6 owns the final verification artifacts.

---

### Task 8: `[checkpoint:human-verify]` — Phase 2 ready for Phase 3 (config schema)

**Depends on:** Task 7 | **Files:** none | **Category:** integration

Pause for operator confirmation. Show:

- All three call sites refactored with `inferenceOptions` constructor parameter.
- 3 atomic commits (one per file).
- Full graph test suite green: 815/815.
- `harness validate` and `harness check-deps` both PASS.
- `KnowledgePipelineRunner` continues to compile and pass integration tests with single-arg constructors.
- Behaviour delta noted in Task 3 commit message: nodes without explicit `metadata.domain` AND without a recognisable path now land in `'unknown'` (formerly `'unclassified'` for code nodes, formerly `'unknown'` for staged business nodes — already aligned). No test relies on the `'unclassified'` literal.

Operator must confirm before invoking `harness-planning` or `harness-execution` for Phase 3 (config schema additions to `packages/cli/src/config/schema.ts`).

If operator pauses here without confirming Phase 3, write a final session summary noting Phase 2 complete and Phase 3 awaiting operator decision.

---

## Verification Commands (Reference)

```bash
# Build
pnpm --filter @harness-engineering/graph build

# Targeted tests (per file)
pnpm --filter @harness-engineering/graph test -- KnowledgeDocMaterializer
pnpm --filter @harness-engineering/graph test -- KnowledgeStagingAggregator
pnpm --filter @harness-engineering/graph test -- CoverageScorer
pnpm --filter @harness-engineering/graph test -- knowledge-pipeline.test.ts

# Full suite
pnpm --filter @harness-engineering/graph test

# Harness checks
harness validate
harness check-deps

# Optional pipeline verification (Phase 6 owns this)
harness knowledge-pipeline
```

## Rollback

Each task is an atomic commit. To roll back Phase 2 entirely:

```bash
git revert <task-3-sha> <task-2-sha> <task-1-sha>
```

The shared helper at `packages/graph/src/ingest/domain-inference.ts` (Phase 1) is independent and remains in place after Phase 2 rollback.

## Carry-Forward Concerns (Acknowledged, Not Fixed)

From Phase 1 review:

- **DTS typecheck failures** in `packages/graph/src/ingest.ts`, `packages/graph/src/knowledge-pipeline.ts`, `packages/mcp/src/tools/graph/ingest-source.ts` (pre-existing).
- **72% docs coverage baseline** / API index pages (pre-existing).
- **Pre-commit arch hook warnings** on unrelated files (pre-existing).
- **Stale `packages/graph/dist/`** from Phase 1 INTEGRATE — Task 1's `pnpm --filter @harness-engineering/graph build` rebuilds, so this is incidentally addressed but not the focus.

## Skill References (from SKILLS.md)

- `ts-utility-types` (Reference, 0.53) — Useful background when reviewing the optional/positional constructor parameter shape and the `_fallback?` deprecation pattern.
- `gof-chain-of-responsibility` (Reference, 0.51) — Adjacent — the helper's precedence cascade (metadata → extraPatterns → DEFAULT_PATTERNS → first-segment → linker source → 'unknown') is conceptually a chain. No direct application in this phase.

(Other skills in SKILLS.md are weak matches and not annotated on individual tasks.)
