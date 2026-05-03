# Plan: Phase 4 — Config plumbing for `KnowledgePipelineRunner` and inferenceOptions integration coverage

**Date:** 2026-05-03 | **Spec:** `docs/changes/knowledge-domain-classifier/proposal.md` | **Phase 1 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase1-shared-helper-plan.md` | **Phase 2 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase2-wire-call-sites-plan.md` | **Phase 3 plan:** `docs/changes/knowledge-domain-classifier/plans/2026-05-03-phase3-config-schema-plan.md` | **Tasks:** 9 | **Time:** ~38 min | **Integration Tier:** medium

## Goal

Thread `knowledge.domainPatterns` and `knowledge.domainBlocklist` from `harness.config.json` through `KnowledgePipelineRunner` into the three `inferenceOptions` consumers (`KnowledgeStagingAggregator`, `CoverageScorer`, `KnowledgeDocMaterializer`); prove the wiring with unit tests on each class plus an end-to-end integration test that demonstrates `agents/skills/foo` reclassifies from `agents` (default-fallback) to `skills` (config-pattern) when `knowledge.domainPatterns: ["agents/<dir>"]` is supplied to the runner.

## Observable Truths (Acceptance Criteria)

Derived from spec Implementation Order steps 15–18, Success Criteria #15–17 (Aggregator Integration), #21–22 (Configuration), #26 (Backward Compatibility), and #27–31 (Validation). EARS framing where behavioral.

1. **[Ubiquitous]** The system shall expose an optional `inferenceOptions?: DomainInferenceOptions` field on `KnowledgePipelineOptions` (`packages/graph/src/ingest/KnowledgePipelineRunner.ts`), surfaced in the export type so CLI callers can pass resolved patterns/blocklist.
2. **[Ubiquitous]** `KnowledgePipelineRunner.detect()` shall construct `KnowledgeStagingAggregator` with `this.inferenceOptions` (the resolved options on the runner instance) instead of `{}`.
3. **[Ubiquitous]** `KnowledgePipelineRunner.run()` shall construct `CoverageScorer(this.inferenceOptions)` instead of `CoverageScorer()`.
4. **[Ubiquitous]** `KnowledgePipelineRunner.remediate()` shall construct `KnowledgeDocMaterializer(this.store, this.inferenceOptions)` instead of `KnowledgeDocMaterializer(this.store)`.
5. **[Ubiquitous]** `KnowledgePipelineRunner.stageNewFindings()` shall construct `KnowledgeStagingAggregator(options.projectDir, this.inferenceOptions)` (the second positional arg) instead of the single-arg form.
6. **[Event-driven]** When `KnowledgePipelineRunner` is constructed without inferenceOptions (back-compat path: `new KnowledgePipelineRunner(store)`), the system shall default `this.inferenceOptions = {}` and propagate the empty object to all four downstream construction sites — preserving existing behavior in tests, fixture pipelines, and standalone callers (Success Criterion #26).
7. **[Event-driven]** When `KnowledgePipelineRunner.run({ inferenceOptions: { extraPatterns, extraBlocklist } })` is invoked, the system shall use the per-call options, taking precedence over any constructor-supplied default. Field rename mapping: `knowledge.domainPatterns` → `extraPatterns`, `knowledge.domainBlocklist` → `extraBlocklist` (handled at the CLI boundary; the runner accepts the renamed shape directly).
8. **[Event-driven]** When `packages/cli/src/commands/knowledge-pipeline.ts` invokes `resolveConfig()` and finds `knowledge.domainPatterns` and/or `knowledge.domainBlocklist`, the system shall map them to `inferenceOptions: { extraPatterns: cfg.knowledge.domainPatterns, extraBlocklist: cfg.knowledge.domainBlocklist }` and pass the result through `pipelineOpts` into `runner.run(...)`.
9. **[Event-driven]** When the CLI command runs against a project with no `harness.config.json` or a config that omits `knowledge`, the system shall continue to pass `inferenceOptions: undefined` (or omit the field), keeping the runner default behavior unchanged (back-compat preservation; Success Criterion #21, #26).
10. **[Ubiquitous]** Each of the three classes shall gain at least one unit test that constructs the class with non-default `inferenceOptions: { extraPatterns: ["agents/<dir>"] }` and asserts the path-bucketing reflects the override — closing Phase 2 review-important #1 (no direct test coverage).
11. **[Event-driven]** When the integration test (Task 8) invokes `KnowledgePipelineRunner.run` against a fixture project containing `agents/skills/foo.ts` (a code file extractable as a `function` or `file` node) with `inferenceOptions: { extraPatterns: ["agents/<dir>"] }`, the resulting `coverage.domains` and `gaps.domains` arrays shall include a domain entry keyed `'skills'` and shall not bucket the same node under `'agents'` — directly proving the spec Success Criterion #22.
12. **[Event-driven]** When the same integration test runs the pipeline against the same fixture without `inferenceOptions`, the system shall classify the file under `'agents'` (generic-fallback first segment) — closing Phase 2 review-important #2 (aggregator-level path-bucketing regression test).
13. **[Ubiquitous]** Running `harness validate` shall pass after the change (Success Criterion #27).
14. **[Ubiquitous]** Running `harness check-deps` shall pass with no new layer/import-direction violations (Success Criterion #28).
15. **[Ubiquitous]** Running `pnpm --filter @harness-engineering/graph test` shall produce 0 regressions versus the pre-change baseline; new tests added by Phase 4 shall add at least 4 cases (3 unit, ≥1 integration with both with/without-config branches asserted).
16. **[Ubiquitous]** Running `pnpm --filter @harness-engineering/cli test` shall produce 0 regressions versus the pre-change baseline. (Phase 3 baseline: 1 pre-existing pipeline-integration.test.ts:178 failure carries forward.)

## Skill Annotations

From `docs/changes/knowledge-domain-classifier/SKILLS.md` — Reference tier only. The relevant matches for Phase 4:

- Task 1 (runner field plumbing): `ts-utility-types` (reference) — applying optional/readonly utility-type idioms to the new `inferenceOptions` slot.
- Task 6 (constructor-param unit tests on the 3 classes): `ts-testing-types` (reference) — type-safe assertion patterns.
- Task 8 (integration test fixture): `gof-builder-pattern` (reference) — builder-style fixture construction for the on-disk project skeleton.

Other skills in SKILLS.md are weakly relevant to Phase 4; annotations omitted where the match is coincidental.

## File Map

```
MODIFY  packages/graph/src/ingest/KnowledgePipelineRunner.ts            (add inferenceOptions field on options + class member; thread to 4 construction sites)
MODIFY  packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts     (add unit test for inferenceOptions plumbing through detect/score/remediate)
MODIFY  packages/graph/tests/ingest/KnowledgeStagingAggregator.test.ts  (add 1 case asserting inferenceOptions overrides default-fallback)
MODIFY  packages/graph/tests/ingest/CoverageScorer.test.ts              (add 1 case asserting inferenceOptions overrides default-fallback)
MODIFY  packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts    (add 1 case asserting inferenceOptions overrides default-fallback)
CREATE  packages/graph/tests/integration/knowledge-pipeline-domain-config.test.ts  (new integration test — fixture project with/without config; agents/skills/foo)
MODIFY  packages/cli/src/commands/knowledge-pipeline.ts                 (read knowledge.domainPatterns/domainBlocklist; map to inferenceOptions; thread to runner)
```

No barrel updates needed — `DomainInferenceOptions` is already exported from `@harness-engineering/graph` per Phase 1. No `harness.config.json` changes in this repo (verification-only test in Phase 6 owns that).

## Skeleton

Standard rigor with task count = 9 (≥8 threshold). Skeleton produced and approved (auto-approval):

1. Runner plumbing — surface `inferenceOptions` on options + thread to 4 construction sites (~2 tasks, ~8 min)
2. Class-level unit tests — close Phase 2 review-important #1 across the 3 inferenceOptions consumers (~3 tasks, ~9 min)
3. Runner-level unit test — assert pipeline options propagate through (~1 task, ~4 min)
4. Integration test — end-to-end fixture proving config wins over generic fallback (~1 task, ~8 min)
5. CLI wiring — `resolveConfig()` reads knowledge config and threads to runner (~1 task, ~6 min)
6. Verification — `harness validate`, `harness check-deps`, full graph + cli suites (~1 task, ~3 min)

**Estimated total:** 9 tasks, ~38 min. Skeleton AUTO-APPROVED per session header.

## Uncertainties

- **[ASSUMPTION]** The runner's correct shape is option (a) — `KnowledgePipelineOptions` carries `inferenceOptions?: DomainInferenceOptions` and the runner stores it on `this.inferenceOptions`. Reasoning: matches the existing pattern (constructor takes only `store`; per-call options arrive via `run(options)`). The CLI command already builds a `pipelineOpts: Record<string, unknown>` and passes it to `runner.run(...)` (see `packages/cli/src/commands/knowledge-pipeline.ts:81-83`). Adding one more optional field there is a one-line change. No constructor-arg signature change required.
- **[ASSUMPTION]** Field rename `domainPatterns` → `extraPatterns` and `domainBlocklist` → `extraBlocklist` happens at the CLI boundary (not inside the runner). The runner consumes the helper-shaped names (`extraPatterns`, `extraBlocklist`) since `DomainInferenceOptions` is the public type. Keeps the runner free of config-schema knowledge.
- **[ASSUMPTION]** `KnowledgePipelineRunner` currently constructs its three consumers at lines: 112 (CoverageScorer), 328 (KnowledgeStagingAggregator inside `detect`), 369 (KnowledgeDocMaterializer inside `remediate`), and 403 (KnowledgeStagingAggregator inside `stageNewFindings`). Verified by reading the file. Each call passes nothing for `inferenceOptions` today. Phase 4 changes all four sites to thread `this.inferenceOptions`.
- **[ASSUMPTION]** The integration test fixture needs only one extracted code node (a TypeScript file at `agents/skills/foo.ts`) to exercise the path-bucketing branch. The CodeIngestor extractor produces `file` and `function` nodes for `.ts` files; both carry `path` metadata. Verified that `inferDomain` reads `node.path` (path is a top-level field on `GraphNode`) — fixture needs a real `.ts` file extractable by `createExtractionRunner`.
- **[ASSUMPTION]** The integration test does NOT need a `harness.config.json` in the fixture project. The runner consumes `inferenceOptions` directly via `run(options)`; no config-file resolution happens inside the runner. The test passes `inferenceOptions: { extraPatterns: ["agents/<dir>"] }` directly to `runner.run({...})`. Config-file resolution is exercised by the CLI command, which the test wires through indirectly via the CLI command unit test if needed (Task 7 covers the CLI side; Task 8 covers the runner side).
- **[ASSUMPTION]** `pnpm --filter @harness-engineering/cli test` baseline for Phase 4 is the same as Phase 3 close-out: 2980 tests, 1 pre-existing failure (`tests/skill/pipeline-integration.test.ts:178` HandoffSchema/recommendedSkills carry-forward). Phase 4 must add tests on the cli side only if the CLI command logic itself merits new coverage (Task 7); a focused unit test on the resolver→runner glue is cheap to add.
- **[ASSUMPTION]** `groupByDomain` in `CoverageScorer.ts` already accepts `options: DomainInferenceOptions` (line 75) — the deprecated `_fallback` second-positional parameter was retained per Phase 2 for source-level back-compat. Phase 4 does not re-litigate; the unit test simply confirms the option surfaces. Phase 6 review may revisit removing `_fallback`.
- **[ASSUMPTION]** Phase 1/2/3 carry-forwards (DTS typecheck failures, 72% docs coverage, pre-commit arch hook warnings, `tests/skill/pipeline-integration.test.ts:178`) are explicitly OUT of scope for Phase 4 per session header. They surface as "concerns" in the handoff but are not addressed.
- **[DEFERRABLE]** Phase 5 owns the documentation updates (`docs/reference/configuration.md` + `docs/knowledge/graph/node-edge-taxonomy.md` "Domain Inference" section).
- **[DEFERRABLE]** Phase 6 owns end-to-end verification on this repo (running the pipeline against the real codebase to assert `unknown` drops from 7,500 to <100). Phase 4's integration test uses a synthetic fixture only.

## Wiring Diagrams

### Before (Phase 3 close-out — current state)

```
harness.config.json
  └ knowledge.domainPatterns ✓ (schema accepts)
  └ knowledge.domainBlocklist ✓ (schema accepts)
                ↓ NOT READ ANYWHERE
            (orphan fields)

CLI knowledge-pipeline command
  └ resolveConfig() → HarnessConfig
                ↓ knowledge.* ignored
  └ runner.run({ projectDir, fix, ci, ... })
                ↓ inferenceOptions undefined
KnowledgePipelineRunner
  └ new CoverageScorer()                        // {} default
  └ new KnowledgeStagingAggregator(projectDir)  // {} default
  └ new KnowledgeDocMaterializer(store)         // {} default
```

### After (Phase 4 close-out — target state)

```
harness.config.json
  └ knowledge.domainPatterns ✓
  └ knowledge.domainBlocklist ✓

CLI knowledge-pipeline command
  └ resolveConfig() → HarnessConfig
        ↓ knowledge.domainPatterns → extraPatterns
        ↓ knowledge.domainBlocklist → extraBlocklist
        ↓ pipelineOpts.inferenceOptions = { extraPatterns, extraBlocklist }
  └ runner.run({ projectDir, fix, ci, inferenceOptions, ... })
                ↓
KnowledgePipelineRunner
  └ this.inferenceOptions = options.inferenceOptions ?? {}
  └ new CoverageScorer(this.inferenceOptions)
  └ new KnowledgeStagingAggregator(projectDir, this.inferenceOptions)  // detect()
  └ new KnowledgeStagingAggregator(projectDir, this.inferenceOptions)  // stageNewFindings()
  └ new KnowledgeDocMaterializer(store, this.inferenceOptions)
```

## Tasks

### Task 1: Surface `inferenceOptions` on `KnowledgePipelineOptions` and thread to all 4 construction sites in `KnowledgePipelineRunner`

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts` | **Skills:** `ts-utility-types` (reference)

Diff (verbatim):

```diff
--- a/packages/graph/src/ingest/KnowledgePipelineRunner.ts
+++ b/packages/graph/src/ingest/KnowledgePipelineRunner.ts
@@ -32,6 +32,7 @@ import { ImageAnalysisExtractor, type AnalysisProvider } from './ImageAnalysisExtractor.js';
 import { ContradictionDetector, type ContradictionResult } from './ContradictionDetector.js';
 import { CoverageScorer, type CoverageReport } from './CoverageScorer.js';
 import { KnowledgeDocMaterializer, type MaterializeResult } from './KnowledgeDocMaterializer.js';
+import type { DomainInferenceOptions } from './domain-inference.js';
 import { DecisionIngestor } from './DecisionIngestor.js';

@@ -57,6 +58,12 @@ const SNAPSHOT_NODE_TYPES: readonly NodeType[] = [
 // ─── Public Types ───────────────────────────────────────────────────────────

 export interface KnowledgePipelineOptions {
   readonly projectDir: string;
   readonly fix: boolean;
   readonly ci: boolean;
   readonly domain?: string;
   readonly graphDir?: string;
   readonly maxIterations?: number;
   readonly analyzeImages?: boolean;
   readonly analysisProvider?: AnalysisProvider;
   readonly imagePaths?: readonly string[];
+  /**
+   * Domain-inference overrides threaded into KnowledgeStagingAggregator,
+   * CoverageScorer, and KnowledgeDocMaterializer. Sourced by the CLI from
+   * `harness.config.json#knowledge.domainPatterns` (→ extraPatterns) and
+   * `knowledge.domainBlocklist` (→ extraBlocklist). Defaults to {} when absent.
+   */
+  readonly inferenceOptions?: DomainInferenceOptions;
 }
```

Then thread the resolved options through the runner. Add a member field initialized in `run()` (the per-call options precedence). Replace each of the four construction sites:

```diff
 export class KnowledgePipelineRunner {
-  constructor(private readonly store: GraphStore) {}
+  constructor(private readonly store: GraphStore) {}
+
+  /** Resolved per-`run()` inference options. Set on entry to `run()`. */
+  private inferenceOptions: DomainInferenceOptions = {};

   async run(options: KnowledgePipelineOptions): Promise<KnowledgePipelineResult> {
+    this.inferenceOptions = options.inferenceOptions ?? {};
     const remediations: string[] = [];
```

Site 1 — line 112 (`CoverageScorer`):

```diff
-    const coverage = new CoverageScorer().score(this.store);
+    const coverage = new CoverageScorer(this.inferenceOptions).score(this.store);
```

Site 2 — line 328 (inside `detect`):

```diff
-    const aggregator = new KnowledgeStagingAggregator(options.projectDir);
+    const aggregator = new KnowledgeStagingAggregator(options.projectDir, this.inferenceOptions);
```

Site 3 — line 369 (inside `remediate`):

```diff
-        const materializer = new KnowledgeDocMaterializer(this.store);
+        const materializer = new KnowledgeDocMaterializer(this.store, this.inferenceOptions);
```

Site 4 — line 403 (inside `stageNewFindings`):

```diff
-      const aggregator = new KnowledgeStagingAggregator(options.projectDir);
+      const aggregator = new KnowledgeStagingAggregator(options.projectDir, this.inferenceOptions);
```

Steps:

1. Apply the diff above.
2. Run `pnpm --filter @harness-engineering/graph build` to confirm typecheck passes (the `DomainInferenceOptions` import path resolves; field is correctly optional).
3. Run `pnpm --filter @harness-engineering/graph test -- KnowledgePipelineRunner` — observe existing 100% green (no tests exercise the new path yet, but none should regress because back-compat default of `{}` matches prior behavior).
4. Run `harness validate` — must pass.
5. Commit: `feat(graph/runner): thread inferenceOptions through KnowledgePipelineRunner to 4 construction sites`

### Task 2: Unit test — `KnowledgePipelineRunner.run({ inferenceOptions })` propagates through to downstream classes

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`

Append a new `describe` block at the bottom of the existing file (before the closing `});`):

```ts
describe('inferenceOptions plumbing (Phase 4)', () => {
  it('defaults to {} when no inferenceOptions field on options', async () => {
    // Pre-seed graph with one node whose path lands under a non-default top-level dir.
    store.addNode({
      id: 'extracted:agents:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run(makeOptions());

    // Generic first-segment fallback: 'agents'
    const domains = result.coverage.domains.map((d) => d.domain);
    expect(domains).toContain('agents');
    expect(domains).not.toContain('skills');
  });

  it('routes inferenceOptions.extraPatterns through to CoverageScorer', async () => {
    store.addNode({
      id: 'extracted:agents:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run(
      makeOptions({ inferenceOptions: { extraPatterns: ['agents/<dir>'] } })
    );

    const domains = result.coverage.domains.map((d) => d.domain);
    expect(domains).toContain('skills');
    expect(domains).not.toContain('agents');
  });

  it('routes inferenceOptions.extraBlocklist through to CoverageScorer (blocklisted segment falls through)', async () => {
    store.addNode({
      id: 'extracted:scratch:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'scratch/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run(
      makeOptions({ inferenceOptions: { extraBlocklist: ['scratch'] } })
    );

    // 'scratch' is now blocklisted → first non-blocklisted segment is 'foo.ts'... but 'foo.ts'
    // is the leaf, not a directory. With path 'scratch/foo.ts' and 'scratch' blocklisted,
    // the next segment is 'foo.ts' which the helper returns as-is when no match.
    // Easier assertion: the bucket is NOT 'scratch'.
    const domains = result.coverage.domains.map((d) => d.domain);
    expect(domains).not.toContain('scratch');
  });
});
```

Steps:

1. Append the `describe` block to `packages/graph/tests/ingest/KnowledgePipelineRunner.test.ts`.
2. Run: `pnpm --filter @harness-engineering/graph test -- KnowledgePipelineRunner`. Expect: all prior cases green + 3 new cases green.
3. If a case fails because the helper returns a different domain than expected for the blocklist test (e.g., the second segment is `foo.ts` and the helper has different leaf-handling): adjust the assertion to use `expect(domains).not.toContain('scratch')` only (which is the load-bearing claim — the blocklist is consulted).
4. Run `harness validate`.
5. Commit: `test(graph/runner): assert inferenceOptions propagate from runner.run through to coverage`

### Task 3: Unit test — `KnowledgeStagingAggregator` inferenceOptions overrides default fallback (closes Phase 2 review-important #2)

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/KnowledgeStagingAggregator.test.ts` | **Skills:** `ts-testing-types` (reference)

Append a new `describe` block at the bottom of the existing file:

```ts
describe('inferenceOptions path-bucketing (Phase 4)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agg-bucket-'));
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('without inferenceOptions, agents/skills/foo buckets under "agents" (generic fallback)', async () => {
    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
    await fs.mkdir(knowledgeDir, { recursive: true });

    const store = new GraphStore();
    store.addNode({
      id: 'extracted:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet consectetur',
    });

    const aggregator = new KnowledgeStagingAggregator(tmpDir);
    const report = await aggregator.generateGapReport(knowledgeDir, store);

    expect(report.domains.map((d) => d.domain)).toContain('agents');
    expect(report.domains.map((d) => d.domain)).not.toContain('skills');
  });

  it('with inferenceOptions.extraPatterns ["agents/<dir>"], same node buckets under "skills"', async () => {
    const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
    await fs.mkdir(knowledgeDir, { recursive: true });

    const store = new GraphStore();
    store.addNode({
      id: 'extracted:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet consectetur',
    });

    const aggregator = new KnowledgeStagingAggregator(tmpDir, {
      extraPatterns: ['agents/<dir>'],
    });
    const report = await aggregator.generateGapReport(knowledgeDir, store);

    expect(report.domains.map((d) => d.domain)).toContain('skills');
    expect(report.domains.map((d) => d.domain)).not.toContain('agents');
  });
});
```

Steps:

1. Verify imports at the top of the test file include `os`, `path`, `fs/promises`, `GraphStore`. Add any missing imports.
2. Append the `describe` block.
3. Run: `pnpm --filter @harness-engineering/graph test -- KnowledgeStagingAggregator`. Expect: prior cases green + 2 new cases green.
4. Run `harness validate`.
5. Commit: `test(graph/aggregator): inferenceOptions.extraPatterns overrides path-bucketing default`

### Task 4: Unit test — `CoverageScorer` inferenceOptions overrides default fallback

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/CoverageScorer.test.ts` | **Skills:** `ts-testing-types` (reference)

Append a new `describe` block at the bottom of the existing file:

```ts
describe('inferenceOptions plumbing (Phase 4)', () => {
  it('without inferenceOptions, agents/skills/foo lands in "agents" bucket', () => {
    const store = new GraphStore();
    store.addNode({
      id: 'kn:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet',
    });

    const scorer = new CoverageScorer();
    const report = scorer.score(store);

    expect(report.domains.map((d) => d.domain)).toContain('agents');
    expect(report.domains.map((d) => d.domain)).not.toContain('skills');
  });

  it('with inferenceOptions.extraPatterns ["agents/<dir>"], same node lands in "skills" bucket', () => {
    const store = new GraphStore();
    store.addNode({
      id: 'kn:foo',
      type: 'business_concept',
      name: 'Foo',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'lorem ipsum dolor sit amet',
    });

    const scorer = new CoverageScorer({ extraPatterns: ['agents/<dir>'] });
    const report = scorer.score(store);

    expect(report.domains.map((d) => d.domain)).toContain('skills');
    expect(report.domains.map((d) => d.domain)).not.toContain('agents');
  });
});
```

Steps:

1. Verify the test file imports `CoverageScorer` and `GraphStore`. Add any missing imports.
2. Append the `describe` block.
3. Run: `pnpm --filter @harness-engineering/graph test -- CoverageScorer`. Expect: prior cases green + 2 new cases green.
4. Run `harness validate`.
5. Commit: `test(graph/scorer): inferenceOptions.extraPatterns overrides CoverageScorer fallback`

### Task 5: Unit test — `KnowledgeDocMaterializer` inferenceOptions overrides default fallback

**Depends on:** Task 1 | **Files:** `packages/graph/tests/ingest/KnowledgeDocMaterializer.test.ts` | **Skills:** `ts-testing-types` (reference)

Append a new `describe` block at the bottom of the existing file:

```ts
describe('inferenceOptions plumbing (Phase 4)', () => {
  it('with inferenceOptions.extraPatterns ["agents/<dir>"], doc materializes under docs/knowledge/skills/', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mat-cfg-'));

    try {
      const store = new GraphStore();
      store.addNode({
        id: 'extracted:foo',
        type: 'business_rule',
        name: 'Foo Rule',
        path: 'agents/skills/foo.ts',
        metadata: { source: 'extractor' },
        content: 'When the system encounters a foo, it shall do bar within 30 seconds.',
      });

      const materializer = new KnowledgeDocMaterializer(store, {
        extraPatterns: ['agents/<dir>'],
      });
      const result = await materializer.materialize(
        [
          {
            nodeId: 'extracted:foo',
            name: 'Foo Rule',
            nodeType: 'business_rule',
            source: 'extractor',
            hasContent: true,
          },
        ],
        { projectDir: tmpDir, dryRun: false }
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0].domain).toBe('skills');
      expect(result.created[0].filePath).toContain('docs/knowledge/skills/');
    } finally {
      await fs.rm(tmpDir, { recursive: true });
    }
  });
});
```

Steps:

1. Verify imports include `fs/promises`, `os`, `path`, `GraphStore`, `KnowledgeDocMaterializer`. Add any missing imports.
2. Append the `describe` block.
3. Run: `pnpm --filter @harness-engineering/graph test -- KnowledgeDocMaterializer`. Expect: prior cases green + 1 new case green.
4. If the materializer skips the entry due to content-length / valid-business-types filtering: pad the content to >= 30 chars (already done) and confirm `nodeType: 'business_rule'` matches `VALID_BUSINESS_TYPES` (yes — line 47-53 in `KnowledgeDocMaterializer.ts`).
5. Run `harness validate`.
6. Commit: `test(graph/materializer): inferenceOptions.extraPatterns route doc to correct domain dir`

### Task 6: Integration test — full pipeline with/without inferenceOptions on a fixture project

**Depends on:** Tasks 1, 3, 4, 5 | **Files:** `packages/graph/tests/integration/knowledge-pipeline-domain-config.test.ts` | **Skills:** `gof-builder-pattern` (reference)

Create the new file:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';

describe('Knowledge Pipeline — domain config plumbing (Phase 4)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kp-domain-cfg-'));
    // Set up fixture project structure
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'extracted'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'staged'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'agents', 'skills'), { recursive: true });

    // One TypeScript file at agents/skills/foo.ts — extractable as a code-signal node.
    await fs.writeFile(
      path.join(tmpDir, 'agents', 'skills', 'foo.ts'),
      `/**\n * Foo skill — example documentation.\n * Lorem ipsum dolor sit amet.\n */\nexport function foo(): string {\n  return 'foo';\n}\n`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // best-effort
    }
  });

  it('without inferenceOptions, agents/skills/foo classifies under "agents" (generic fallback)', async () => {
    const store = new GraphStore();
    // Pre-seed a knowledge node whose path lands under agents/skills/. The
    // pipeline scores domains over knowledge nodes (CoverageScorer) and
    // generates the gap report (KnowledgeStagingAggregator). Adding a
    // business_rule with the right path exercises both consumers.
    store.addNode({
      id: 'extracted:foo',
      type: 'business_rule',
      name: 'Foo Rule',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'When the system encounters a foo, it shall return foo within 1 ms.',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
    });

    const coverageDomains = result.coverage.domains.map((d) => d.domain);
    expect(coverageDomains).toContain('agents');
    expect(coverageDomains).not.toContain('skills');
  });

  it('with inferenceOptions.extraPatterns ["agents/<dir>"], same node classifies under "skills"', async () => {
    const store = new GraphStore();
    store.addNode({
      id: 'extracted:foo',
      type: 'business_rule',
      name: 'Foo Rule',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'When the system encounters a foo, it shall return foo within 1 ms.',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
      inferenceOptions: { extraPatterns: ['agents/<dir>'] },
    });

    const coverageDomains = result.coverage.domains.map((d) => d.domain);
    expect(coverageDomains).toContain('skills');
    expect(coverageDomains).not.toContain('agents');
  });

  it('the same fixture run twice with different inferenceOptions returns different domain bucketing', async () => {
    // Demonstrates the runner does not retain state between calls — per-call
    // options take precedence as documented.
    const buildStore = () => {
      const s = new GraphStore();
      s.addNode({
        id: 'extracted:foo',
        type: 'business_rule',
        name: 'Foo Rule',
        path: 'agents/skills/foo.ts',
        metadata: { source: 'extractor' },
        content: 'When the system encounters a foo, it shall return foo within 1 ms.',
      });
      return s;
    };

    const runner1 = new KnowledgePipelineRunner(buildStore());
    const r1 = await runner1.run({ projectDir: tmpDir, fix: false, ci: true });
    expect(r1.coverage.domains.map((d) => d.domain)).toContain('agents');

    const runner2 = new KnowledgePipelineRunner(buildStore());
    const r2 = await runner2.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
      inferenceOptions: { extraPatterns: ['agents/<dir>'] },
    });
    expect(r2.coverage.domains.map((d) => d.domain)).toContain('skills');
  });
});
```

Steps:

1. Create the file with the verbatim contents above.
2. Run: `pnpm --filter @harness-engineering/graph test -- knowledge-pipeline-domain-config`. Expect: 3 cases green.
3. Run the full graph integration suite to confirm no regressions: `pnpm --filter @harness-engineering/graph test -- integration`.
4. Run `harness validate`.
5. Run `harness check-deps`.
6. Commit: `test(graph/integration): full pipeline asserts inferenceOptions wins over default fallback (closes spec SC#22)`

### Task 7: Wire `harness.config.json#knowledge.*` into the CLI command and pass to the runner

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/knowledge-pipeline.ts`

Diff (verbatim):

```diff
--- a/packages/cli/src/commands/knowledge-pipeline.ts
+++ b/packages/cli/src/commands/knowledge-pipeline.ts
@@ -1,6 +1,7 @@
 import { Command } from 'commander';
 import * as path from 'node:path';
 import chalk from 'chalk';
+import { resolveConfig } from '../config/loader';
 import { logger } from '../output/logger';

 export function createKnowledgePipelineCommand(): Command {
@@ -34,6 +35,17 @@ export function createKnowledgePipelineCommand(): Command {
           // Fresh graph
         }

+        // Resolve inference options from harness.config.json (knowledge.*)
+        // Mapping: knowledge.domainPatterns -> extraPatterns
+        //          knowledge.domainBlocklist -> extraBlocklist
+        // Absent / missing config: skip; runner defaults to {}.
+        const cfgResult = resolveConfig();
+        const cfgKnowledge = cfgResult.ok ? cfgResult.value.knowledge : undefined;
+        const inferenceOptions =
+          cfgKnowledge && (cfgKnowledge.domainPatterns?.length || cfgKnowledge.domainBlocklist?.length)
+            ? {
+                ...(cfgKnowledge.domainPatterns?.length
+                  ? { extraPatterns: cfgKnowledge.domainPatterns }
+                  : {}),
+                ...(cfgKnowledge.domainBlocklist?.length
+                  ? { extraBlocklist: cfgKnowledge.domainBlocklist }
+                  : {}),
+              }
+            : undefined;
+
         // Build pipeline options
         const pipelineOpts: Record<string, unknown> = {
           projectDir,
           fix: Boolean(opts.fix),
           ci: Boolean(opts.ci),
           ...(opts.domain ? { domain: opts.domain as string } : {}),
           graphDir,
           analyzeImages: Boolean(opts.analyzeImages),
+          ...(inferenceOptions ? { inferenceOptions } : {}),
         };
```

Steps:

1. Apply the diff. Note: the import path `../config/loader` matches the existing pattern in other commands.
2. Run `pnpm --filter @harness-engineering/cli build` to confirm typecheck passes.
3. Run `pnpm --filter @harness-engineering/cli test -- knowledge-pipeline`. Expect: prior tests pass; no regressions. (The CLI command unit test, if any, exercises this path indirectly.)
4. Manual sanity (no fixture file change): grep the resulting compiled output for `inferenceOptions` to confirm the field surfaces. If a CLI command test exists, add one case asserting that when `resolveConfig()` returns a config with `knowledge.domainPatterns: ["agents/<dir>"]`, the runner is invoked with `inferenceOptions.extraPatterns: ["agents/<dir>"]`. If no command-level test exists for the knowledge-pipeline command, skip — Task 6's runner-level test is the load-bearing assertion for the wiring; the CLI side is mechanical glue.
5. Run `harness validate`.
6. Run `harness check-deps`.
7. Commit: `feat(cli/knowledge-pipeline): map knowledge.domainPatterns/domainBlocklist to runner inferenceOptions`

### Task 8: Verification — run full test suites and ensure 0 regressions

**Depends on:** Tasks 1–7 | **Files:** none (verification-only)

Steps:

1. Run: `pnpm --filter @harness-engineering/graph test`. Capture the count of pass/fail tests. Compare against the pre-Phase-4 baseline (run `git stash` + same command + `git stash pop` only if a baseline number is unknown — otherwise use the count from the Phase 3 close-out handoff).
2. Run: `pnpm --filter @harness-engineering/cli test`. Confirm:
   - Total tests is `>= 2980` (Phase 3 baseline) plus any new CLI test from Task 7.
   - Pre-existing failure (`tests/skill/pipeline-integration.test.ts:178`) is the only failure.
   - 0 regressions.
3. Run: `harness validate`. Must pass.
4. Run: `harness check-deps`. Must pass.
5. Run: `pnpm --filter @harness-engineering/graph build` and `pnpm --filter @harness-engineering/cli build`. Both must compile.
6. Capture the test deltas for the handoff:
   - Graph: prior count → new count, with breakdown of which test files added cases (KnowledgePipelineRunner +3, KnowledgeStagingAggregator +2, CoverageScorer +2, KnowledgeDocMaterializer +1, integration +3 = +11).
   - CLI: prior count → new count (+0 or +1 depending on Task 7 outcome).
7. No commit (verification-only).

### Task 9: `[checkpoint:human-verify]` — surface Phase 4 deliverables for confirmation

**Depends on:** Tasks 1–8 | **Files:** none

Steps:

1. Summarize the Phase 4 output:
   - 7 commits landed (1 per implementation task, 4 unit-test commits, 1 integration-test commit, 1 CLI commit).
   - 11 new graph test cases, 0–1 new CLI test cases.
   - 0 regressions.
   - `harness validate` PASS, `harness check-deps` PASS.
2. State the spec coverage achieved:
   - Implementation Order steps 15–18: complete.
   - Success Criterion #15–17 (aggregator integration): the integration test directly proves SC#22 (config wins over generic fallback) for the synthetic fixture; the real-repo verification SC#15 (`unknown` 7,500 → <100) is owned by Phase 6.
   - Phase 2 review-important #1 and #2: closed by Tasks 3, 4, 5, 6.
3. Write the handoff to `.harness/sessions/changes--knowledge-domain-classifier--proposal/handoff.json` with:
   - `fromSkill`: `harness-planning`
   - `phase`: `plan`
   - `status`: `phase-4-plan-complete-awaiting-execution`
   - `planPath`: this file
   - `nextStep`: `harness-execution against this plan, then Phase 5 (documentation) and Phase 6 (real-repo verification).`
4. Surface checkpoint question to operator: "Phase 4 plan ready (9 tasks, ~38 min). Authorise execution?"
5. No commit.

## Acknowledged Carry-Forward Concerns (NOT fixed in Phase 4)

Per session header — explicitly out of scope for Phase 4. Documented here so the orchestrator and reviewers see them at plan-load time:

- Pre-existing DTS typecheck failures (`graph/ingest.ts`, `knowledge-pipeline.ts`, `mcp/tools/graph/ingest-source.ts`).
- 72% docs coverage baseline / api index pages — Phase 5 owns documentation.
- Pre-commit arch hook complexity/module-size warnings on unrelated files.
- Pre-existing test failure in `tests/skill/pipeline-integration.test.ts:178` (HandoffSchema/recommendedSkills) — orthogonal to this feature.
- Phase 1/2/3 review carry-forwards (10+ suggestions across phases) — not introduced by this work; not addressed here.

## Sequencing Notes

- Tasks 1, 3, 4, 5, 6 (runner change + 4 test files) can run in parallel after Task 1 commits — they touch independent files.
- Task 2 depends only on Task 1 (same file as the runner edit).
- Task 7 depends only on Task 1 (the CLI passes a new field; the runner must accept it).
- Task 8 (verification) depends on Tasks 1–7. Task 9 (checkpoint) depends on Task 8.
- Recommended order: 1 → 2 → (3, 4, 5 in parallel) → 6 → 7 → 8 → 9.
- All implementation tasks (1, 7) and test tasks (2–6) follow TDD-adjacent flow: each commit lands an atomic change and runs its targeted suite before commit. The runner change in Task 1 is intentionally first because the test tasks depend on it compiling.

## Validation Gates

- `harness validate` must pass after each commit-producing task and at Task 8.
- `harness check-deps` must pass at Task 6 (integration test introduces no new layer crossings) and Task 7 (CLI imports config loader — already an allowed dependency).
- 0 regressions in `pnpm --filter @harness-engineering/graph test`.
- 0 regressions in `pnpm --filter @harness-engineering/cli test` (Phase 3 baseline: 2980 tests, 1 pre-existing failure, +0 expected from Phase 4 unless Task 7 adds a CLI command test).
- Each task produces ≤1 commit. Total commits across Phase 4: 7 (Tasks 1–7 commit; Tasks 8–9 do not).
