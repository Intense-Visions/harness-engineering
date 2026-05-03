# Plan: Knowledge Pipeline Integration (Phase 3)

**Date:** 2026-04-25 | **Spec:** docs/changes/knowledge-doc-materialization/proposal.md | **Tasks:** 6 | **Time:** ~25 min

## Goal

Wire the KnowledgeDocMaterializer (Phase 2) and differential gap report (Phase 1) into KnowledgePipelineRunner's convergence loop, and update CLI output to display materialization results and differential gap counts.

## Observable Truths (Acceptance Criteria)

1. When `KnowledgePipelineRunner.run()` is called with `fix: true` and the graph contains undocumented business nodes with content, `docs/knowledge/{domain}/*.md` files are created on disk.
2. When `KnowledgePipelineRunner.run()` is called with `fix: true, ci: true`, no docs are created and `result.materialization` is `undefined`.
3. `KnowledgePipelineResult.materialization` contains `MaterializeResult` with `created` and `skipped` arrays when materialization occurred.
4. The `detect()` method passes `this.store` to `generateGapReport`, so gap reports include extracted vs. documented counts.
5. The convergence loop re-ingests materialized docs in iteration 2, reducing the gap count toward zero.
6. CLI human-readable output shows `N documented / M extracted / K undocumented` for gaps.
7. CLI human-readable output shows materialization section with created/skipped counts and file paths when present.
8. CLI JSON output includes `totalExtracted`, `totalGaps` in the gaps section and a `materialization` field when present.
9. `pnpm --filter @harness-engineering/graph test` passes (all existing + new tests).
10. `pnpm --filter @harness-engineering/cli build` succeeds.

## Uncertainties

- [ASSUMPTION] `MaterializeResult` should be accumulated across convergence iterations (created from all iterations merged). If the loop typically converges in 2 iterations (create docs in iter 1, re-ingest in iter 2 yields 0 gaps), only iter 1 produces materialization. Accumulation is still correct.
- [ASSUMPTION] The `_gapReport` parameter in `runRemediationLoop` (currently unused, prefixed with underscore) was intentionally kept for future use. This plan wires it up, which is its intended purpose.
- [DEFERRABLE] Exact formatting of materialization output in CLI (green "+" prefix). Following the pattern from the spec context.

## File Map

```
MODIFY packages/graph/src/ingest/KnowledgePipelineRunner.ts  (import materializer, add materialization field, wire into remediate/detect/loop/buildResult)
MODIFY packages/cli/src/commands/knowledge-pipeline.ts        (update human-readable + JSON output)
CREATE packages/graph/tests/integration/knowledge-pipeline-materialization.test.ts  (3 integration tests)
```

## Tasks

### Task 1: Add materialization field to KnowledgePipelineResult and update buildResult

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`

1. Read the file (already read above — lines 1-349).
2. Add import for `KnowledgeDocMaterializer` and `MaterializeResult` at the top of the imports section. After the existing `KnowledgeStagingAggregator` import (line 30), add:

   ```typescript
   import { KnowledgeDocMaterializer, type MaterializeResult } from './KnowledgeDocMaterializer.js';
   ```

3. Add `materialization` field to `KnowledgePipelineResult` type (after line 85, before the closing `}`):

   ```typescript
   readonly materialization?: MaterializeResult;
   ```

4. Update `buildResult` method signature and body to accept and include `materialization`. Change the method (lines 164-184) to:

   ```typescript
   private buildResult(
     driftResult: DriftResult,
     iterations: number,
     extraction: ExtractionCounts,
     gaps: GapReport,
     remediations: readonly string[],
     contradictions: ContradictionResult,
     coverage: CoverageReport,
     materialization?: MaterializeResult
   ): KnowledgePipelineResult {
     return {
       verdict: this.computeVerdict(driftResult),
       driftScore: driftResult.driftScore,
       iterations,
       findings: driftResult.summary,
       extraction,
       gaps,
       remediations,
       contradictions,
       coverage,
       ...(materialization ? { materialization } : {}),
     };
   }
   ```

5. Update the `buildResult` call in `run()` (line 116-124) to pass `undefined` as the last argument for now (wired in Task 3):

   ```typescript
   return this.buildResult(
     driftResult,
     iterations,
     extraction,
     gapReport,
     remediations,
     contradictions,
     coverage,
     undefined
   );
   ```

6. Verify: `pnpm --filter @harness-engineering/graph test -- --run`
7. Commit: `feat(graph): add materialization field to KnowledgePipelineResult`

---

### Task 2: Pass store to generateGapReport in detect()

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`

1. In the `detect()` method (line 272), change:

   ```typescript
   const gapReport = await aggregator.generateGapReport(knowledgeDir);
   ```

   to:

   ```typescript
   const gapReport = await aggregator.generateGapReport(knowledgeDir, this.store);
   ```

2. Verify: `pnpm --filter @harness-engineering/graph test -- --run`
3. Commit: `feat(graph): pass store to generateGapReport for differential gap analysis`

---

### Task 3: Make remediate() async, add materialization, wire into convergence loop

**Depends on:** Task 1, Task 2 | **Files:** `packages/graph/src/ingest/KnowledgePipelineRunner.ts`

This is the core wiring task. Three changes in one commit since they are interdependent.

1. **Change `remediate()` signature** (line 279-305) to be async, accept `gapReport`, and return `MaterializeResult | undefined`:

   ```typescript
   private async remediate(
     driftResult: DriftResult,
     remediations: string[],
     options: KnowledgePipelineOptions,
     gapReport: GapReport
   ): Promise<MaterializeResult | undefined> {
     for (const finding of driftResult.findings) {
       switch (finding.classification) {
         case 'stale':
           this.store.removeNode(finding.entryId);
           remediations.push(`removed stale: ${finding.entryId}`);
           break;
         case 'new':
           break;
         case 'drifted':
           if (!options.ci) {
             remediations.push(`flagged drifted: ${finding.entryId}`);
           }
           break;
         case 'contradicting':
           break;
       }
     }

     // Materialize docs for undocumented entries (non-CI only)
     if (!options.ci) {
       const allGapEntries = gapReport.domains.flatMap(d => d.gapEntries);
       const materializable = allGapEntries.filter(e => e.hasContent);
       if (materializable.length > 0) {
         const materializer = new KnowledgeDocMaterializer(this.store);
         const matResult = await materializer.materialize(materializable, {
           projectDir: options.projectDir,
           dryRun: false,
         });
         for (const doc of matResult.created) {
           remediations.push(`created doc: ${doc.filePath}`);
         }
         return matResult;
       }
     }
     return undefined;
   }
   ```

2. **Update `runRemediationLoop()`** (lines 134-161) to track gap report and accumulate materialization results:

   ```typescript
   private async runRemediationLoop(
     options: KnowledgePipelineOptions,
     driftResult: DriftResult,
     gapReport: GapReport,
     remediations: string[]
   ): Promise<{ iterations: number; materialization?: MaterializeResult }> {
     const maxIterations = options.maxIterations ?? 5;
     let iterations = 1;
     let currentDrift = driftResult;
     let currentGapReport = gapReport;
     let previousFindingCount = currentDrift.findings.length;
     let accumulatedMaterialization: MaterializeResult | undefined;

     while (iterations < maxIterations) {
       if (currentDrift.findings.length === 0 && currentGapReport.totalGaps === 0) break;

       const matResult = await this.remediate(currentDrift, remediations, options, currentGapReport);

       // Accumulate materialization results across iterations
       if (matResult) {
         if (!accumulatedMaterialization) {
           accumulatedMaterialization = matResult;
         } else {
           accumulatedMaterialization = {
             created: [...accumulatedMaterialization.created, ...matResult.created],
             skipped: [...accumulatedMaterialization.skipped, ...matResult.skipped],
           };
         }
       }

       await this.extract(options);
       currentDrift = this.runReconciliation(options);
       currentGapReport = await this.detect(options);

       iterations++;
       if (currentDrift.findings.length >= previousFindingCount) break;
       previousFindingCount = currentDrift.findings.length;
     }

     return { iterations, materialization: accumulatedMaterialization };
   }
   ```

3. **Update `run()`** to use the new return type from `runRemediationLoop` and pass materialization to `buildResult`. Change lines 93-125 to:

   ```typescript
   async run(options: KnowledgePipelineOptions): Promise<KnowledgePipelineResult> {
     const remediations: string[] = [];

     // Phases 1-3: Extract, Reconcile, Detect
     const extraction = await this.extract(options);
     let driftResult = this.runReconciliation(options);
     const contradictions = new ContradictionDetector().detect(this.store);
     let gapReport = await this.detect(options);
     const coverage = new CoverageScorer().score(this.store);

     // Phase 4: Remediate (convergence loop)
     let materialization: MaterializeResult | undefined;
     let iterations = 1;

     if (options.fix) {
       const loopResult = await this.runRemediationLoop(options, driftResult, gapReport, remediations);
       iterations = loopResult.iterations;
       materialization = loopResult.materialization;
     }

     // Re-read final state after remediation loop may have mutated driftResult/gapReport
     if (options.fix && iterations > 1) {
       driftResult = this.runReconciliation(options);
       gapReport = await this.detect(options);
     }

     await this.stageNewFindings(driftResult, options);

     return this.buildResult(
       driftResult,
       iterations,
       extraction,
       gapReport,
       remediations,
       contradictions,
       coverage,
       materialization
     );
   }
   ```

4. Verify: `pnpm --filter @harness-engineering/graph test -- --run`
5. Commit: `feat(graph): wire KnowledgeDocMaterializer into pipeline convergence loop`

---

### Task 4: Update CLI output for differential gaps and materialization

**Depends on:** Task 1 | **Files:** `packages/cli/src/commands/knowledge-pipeline.ts`

1. **Update JSON output** (lines 86-89). Change the `gaps` section:

   ```typescript
   gaps: {
     domains: result.gaps.domains.length,
     totalEntries: result.gaps.totalEntries,
     totalExtracted: result.gaps.totalExtracted,
     totalGaps: result.gaps.totalGaps,
   },
   ```

   After the `coverage` section (before the closing of `JSON.stringify`), add:

   ```typescript
   ...(result.materialization
     ? {
         materialization: {
           created: result.materialization.created.length,
           skipped: result.materialization.skipped.length,
           files: result.materialization.created.map((d) => d.filePath),
         },
       }
     : {}),
   ```

2. **Update human-readable output**. Change the gaps line (lines 123-125):

   ```typescript
   console.log(
     `  Gaps: ${result.gaps.domains.length} domains — ${result.gaps.totalEntries} documented / ${result.gaps.totalExtracted} extracted / ${result.gaps.totalGaps} undocumented`
   );
   ```

3. After the remediations block (after line 131), add materialization output:

   ```typescript
   if (result.materialization) {
     const mat = result.materialization;
     console.log(
       `  Materialization: ${mat.created.length} docs created, ${mat.skipped.length} skipped`
     );
     for (const doc of mat.created) {
       console.log(`    ${chalk.green('+')} ${doc.filePath}`);
     }
   }
   ```

4. Verify: `pnpm --filter @harness-engineering/cli build`
5. Commit: `feat(cli): display differential gaps and materialization in knowledge-pipeline output`

---

### Task 5: Add integration tests for pipeline materialization

**Depends on:** Task 3 | **Files:** `packages/graph/tests/integration/knowledge-pipeline-materialization.test.ts`

Create a new test file with 3 integration tests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';

describe('Knowledge Pipeline — materialization integration', () => {
  let tmpDir: string;
  let store: GraphStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mat-pipeline-'));
    store = new GraphStore();
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('fix mode materializes docs from extracted graph nodes', async () => {
    // Seed the graph with business nodes that have content
    store.addNode({
      id: 'extracted:billing:invoice-gen',
      type: 'business_process',
      name: 'Invoice Generation',
      metadata: { domain: 'billing', source: 'extractor' },
      content: 'Generate invoices on the 1st of each month for all active subscriptions',
    });
    store.addNode({
      id: 'extracted:billing:payment-retry',
      type: 'business_rule',
      name: 'Payment Retry Policy',
      metadata: { domain: 'billing', source: 'extractor' },
      content: 'Failed payments are retried up to 3 times with exponential backoff',
    });

    // Ensure docs/knowledge dir exists but is empty
    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge', 'billing'), { recursive: true });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: true,
      ci: false,
      maxIterations: 3,
    });

    // Materialization result should exist
    expect(result.materialization).toBeDefined();
    expect(result.materialization!.created.length).toBe(2);

    // Files should exist on disk
    for (const doc of result.materialization!.created) {
      const fullPath = path.join(tmpDir, doc.filePath);
      const stat = await fs.stat(fullPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(fullPath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('type:');
      expect(content).toContain('domain: billing');
    }

    // Remediations should include created doc entries
    const createdRemediations = result.remediations.filter((r) => r.startsWith('created doc:'));
    expect(createdRemediations.length).toBe(2);
  });

  it('CI mode does NOT create docs', async () => {
    store.addNode({
      id: 'extracted:auth:session-timeout',
      type: 'business_rule',
      name: 'Session Timeout',
      metadata: { domain: 'auth', source: 'extractor' },
      content: 'User sessions expire after 24 hours of inactivity',
    });

    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge', 'auth'), { recursive: true });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: true,
      ci: true,
      maxIterations: 3,
    });

    // Materialization should NOT have occurred
    expect(result.materialization).toBeUndefined();

    // No docs should exist
    const authFiles = await fs.readdir(path.join(tmpDir, 'docs', 'knowledge', 'auth'));
    expect(authFiles.filter((f) => f.endsWith('.md'))).toHaveLength(0);
  });

  it('gap report in result includes differential counts when store has nodes', async () => {
    store.addNode({
      id: 'extracted:payments:refund-rules',
      type: 'business_rule',
      name: 'Refund Rules',
      metadata: { domain: 'payments', source: 'extractor' },
      content: 'Refund within 30 days for all products purchased online',
    });

    // Create a matching doc so it is NOT a gap
    const paymentsDir = path.join(tmpDir, 'docs', 'knowledge', 'payments');
    await fs.mkdir(paymentsDir, { recursive: true });
    await fs.writeFile(
      path.join(paymentsDir, 'refund-rules.md'),
      '---\ntype: business_rule\ndomain: payments\n---\n# Refund Rules\nRefund within 30 days'
    );

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: false,
    });

    // Gap report should have differential data
    expect(result.gaps.totalExtracted).toBeGreaterThan(0);
    expect(result.gaps.totalGaps).toBe(0); // The only node matches the doc
  });
});
```

1. Create the test file at `packages/graph/tests/integration/knowledge-pipeline-materialization.test.ts` with the code above.
2. Verify: `pnpm --filter @harness-engineering/graph test -- --run`
3. Commit: `test(graph): add integration tests for pipeline materialization`

---

### Task 6: Final verification

**Depends on:** Task 1-5 | **Files:** none (verification only)

1. Run full graph test suite: `pnpm --filter @harness-engineering/graph test -- --run`
2. Run CLI build: `pnpm --filter @harness-engineering/cli build`
3. Verify no TypeScript errors: `pnpm --filter @harness-engineering/graph exec tsc --noEmit`
4. If all pass, commit is not needed (verification only).

`[checkpoint:human-verify]` — Confirm all tests pass and CLI builds before marking Phase 3 complete.
