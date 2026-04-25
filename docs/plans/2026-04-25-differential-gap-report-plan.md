# Plan: Differential Gap Report (Knowledge Doc Materialization Phase 1)

**Date:** 2026-04-25 | **Spec:** docs/changes/knowledge-doc-materialization/proposal.md | **Tasks:** 5 | **Time:** ~20 min

## Goal

Expand `KnowledgeStagingAggregator` to produce a differential gap report that compares extracted graph nodes against documented knowledge entries by name, while preserving backward compatibility when no store is provided.

## Observable Truths (Acceptance Criteria)

1. When `generateGapReport(knowledgeDir, store)` is called with a store containing business nodes, the returned `GapReport` includes `totalExtracted` and `totalGaps` with correct counts.
2. When `generateGapReport(knowledgeDir, store)` is called, each `DomainCoverage` includes `extractedCount`, `gapCount`, and `gapEntries` listing graph nodes whose normalized name (lowercase, trimmed) does not match any documented `# Title`.
3. When `generateGapReport(knowledgeDir)` is called without a store, the system returns the existing behavior with `extractedCount=0`, `gapCount=0`, `gapEntries=[]` for backward compatibility.
4. When `writeGapReport` is called with a report containing extracted data (`totalExtracted > 0`), the system renders a differential table with `Documented | Extracted | Gaps` columns.
5. When `writeGapReport` is called with a report containing no extracted data, the system renders the existing `Domain | Entries` format.
6. `GapEntry` type is exported from `packages/graph/src/index.ts`.
7. `npx vitest run tests/integration/knowledge-pipeline.test.ts` passes (run from `packages/graph/`) with new tests covering: differential gap report with store, backward compatibility without store, gap detail accuracy, and differential write format.

## Uncertainties

- [ASSUMPTION] The `# Title` heading extraction uses the same regex as `BusinessKnowledgeIngestor`: `/^#\s+(.+)$/m`. If no heading, filename (sans `.md`) is used.
- [ASSUMPTION] `BUSINESS_NODE_TYPES` constant is defined locally in aggregator (not imported from runner) to avoid coupling.
- [ASSUMPTION] `GapEntry.source` comes from `GraphNode.metadata?.source`, defaulting to `'unknown'`.
- [DEFERRABLE] Frontmatter parsing for documented files only needs the `# Title` line, not the full YAML block, since we compare by name only.

## File Map

- MODIFY `packages/graph/src/ingest/KnowledgeStagingAggregator.ts` (types, implementation)
- MODIFY `packages/graph/src/index.ts` (add `GapEntry` export)
- MODIFY `packages/graph/tests/integration/knowledge-pipeline.test.ts` (new test cases)

## Tasks

### Task 1: Add GapEntry type and expand DomainCoverage and GapReport interfaces

**Depends on:** none | **Files:** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`

1. Open `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`
2. Add the `GraphStore` import (type-only) at the top:
   ```typescript
   import type { GraphStore } from '../store/GraphStore.js';
   ```
3. After the `StagedEntry` interface (line 23), add the `GapEntry` interface:
   ```typescript
   export interface GapEntry {
     readonly nodeId: string;
     readonly name: string;
     readonly nodeType: NodeType;
     readonly source: string;
     readonly hasContent: boolean;
   }
   ```
4. Replace the `DomainCoverage` interface with:
   ```typescript
   export interface DomainCoverage {
     readonly domain: string;
     readonly entryCount: number;
     readonly extractedCount: number;
     readonly gapCount: number;
     readonly gapEntries: readonly GapEntry[];
   }
   ```
5. Replace the `GapReport` interface with:
   ```typescript
   export interface GapReport {
     readonly domains: readonly DomainCoverage[];
     readonly totalEntries: number;
     readonly totalExtracted: number;
     readonly totalGaps: number;
     readonly generatedAt: string;
   }
   ```
6. Run: `cd packages/graph && npx tsc --noEmit` — expect type errors in implementation (generateGapReport and writeGapReport no longer match). This is expected and fixed in Task 2.
7. Commit: `feat(graph): add GapEntry type and expand DomainCoverage/GapReport interfaces`

### Task 2: Implement differential logic in generateGapReport

**Depends on:** Task 1 | **Files:** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`

1. Add the `BUSINESS_NODE_TYPES` constant above the class:
   ```typescript
   const BUSINESS_NODE_TYPES: readonly NodeType[] = [
     'business_concept',
     'business_rule',
     'business_process',
     'business_term',
     'business_metric',
     'business_fact',
   ];
   ```
2. Add a private helper method to the class for extracting the title from a markdown file:
   ```typescript
   private async extractDocName(filePath: string): Promise<string> {
     const raw = await fs.readFile(filePath, 'utf-8');
     // Skip frontmatter if present
     const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
     const body = fmMatch ? fmMatch[1]! : raw;
     const titleMatch = body.match(/^#\s+(.+)$/m);
     return titleMatch ? titleMatch[1]!.trim() : path.basename(filePath, '.md');
   }
   ```
3. Replace the `generateGapReport` method with:

   ```typescript
   async generateGapReport(knowledgeDir: string, store?: GraphStore): Promise<GapReport> {
     // Step 1: Collect documented entries per domain (existing logic)
     const domainDocNames = new Map<string, string[]>(); // domain -> normalized names
     const domainEntryCounts = new Map<string, number>();
     let totalEntries = 0;

     try {
       const entries = await fs.readdir(knowledgeDir, { withFileTypes: true });
       const domainDirs = entries.filter((e) => e.isDirectory());

       for (const dir of domainDirs) {
         const domainPath = path.join(knowledgeDir, dir.name);
         const files = await fs.readdir(domainPath);
         const mdFiles = files.filter((f) => f.endsWith('.md'));
         const entryCount = mdFiles.length;
         totalEntries += entryCount;
         domainEntryCounts.set(dir.name, entryCount);

         // Step 2: Extract documented names for comparison
         if (store) {
           const names: string[] = [];
           for (const file of mdFiles) {
             const name = await this.extractDocName(path.join(domainPath, file));
             names.push(name.toLowerCase().trim());
           }
           domainDocNames.set(dir.name, names);
         }
       }
     } catch {
       // Knowledge directory doesn't exist — return empty report
     }

     // Step 3: If no store, return backward-compatible result
     if (!store) {
       const domains: DomainCoverage[] = [];
       for (const [domain, entryCount] of domainEntryCounts) {
         domains.push({ domain, entryCount, extractedCount: 0, gapCount: 0, gapEntries: [] });
       }
       return { domains, totalEntries, totalExtracted: 0, totalGaps: 0, generatedAt: new Date().toISOString() };
     }

     // Step 4: Query store for all business nodes, group by domain
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

     // Step 5: Build domain coverage with gap analysis
     const allDomains = new Set([...domainEntryCounts.keys(), ...extractedByDomain.keys()]);
     const domains: DomainCoverage[] = [];
     let totalExtracted = 0;
     let totalGaps = 0;

     for (const domain of allDomains) {
       const entryCount = domainEntryCounts.get(domain) ?? 0;
       const extractedNodes = extractedByDomain.get(domain) ?? [];
       const extractedCount = extractedNodes.length;
       totalExtracted += extractedCount;

       const docNames = domainDocNames.get(domain) ?? [];
       const gapEntries: GapEntry[] = [];

       for (const node of extractedNodes) {
         const normalizedName = node.name.toLowerCase().trim();
         if (!docNames.includes(normalizedName)) {
           gapEntries.push({
             nodeId: node.id,
             name: node.name,
             nodeType: node.type,
             source: (node.metadata?.source as string) ?? 'unknown',
             hasContent: Boolean(node.content && node.content.length >= 10),
           });
         }
       }

       totalGaps += gapEntries.length;
       domains.push({ domain, entryCount, extractedCount, gapCount: gapEntries.length, gapEntries });
     }

     return { domains, totalEntries, totalExtracted, totalGaps, generatedAt: new Date().toISOString() };
   }
   ```

4. Run: `cd packages/graph && npx tsc --noEmit` — expect success (or only errors in writeGapReport, fixed in Task 3).
5. Commit: `feat(graph): implement differential gap analysis in generateGapReport`

### Task 3: Update writeGapReport for differential format

**Depends on:** Task 1 | **Files:** `packages/graph/src/ingest/KnowledgeStagingAggregator.ts`

1. Replace the `writeGapReport` method with:

   ```typescript
   async writeGapReport(report: GapReport): Promise<void> {
     const gapsDir = path.join(this.projectDir, '.harness', 'knowledge');
     await fs.mkdir(gapsDir, { recursive: true });

     const hasDifferential = report.totalExtracted > 0;
     const lines: string[] = [
       '# Knowledge Gaps Report',
       '',
       `Generated: ${report.generatedAt}`,
       '',
       '## Coverage by Domain',
       '',
     ];

     if (hasDifferential) {
       lines.push(
         '| Domain | Documented | Extracted | Gaps |',
         '| ------ | ---------- | --------- | ---- |'
       );
       for (const domain of report.domains) {
         lines.push(`| ${domain.domain} | ${domain.entryCount} | ${domain.extractedCount} | ${domain.gapCount} |`);
       }
       lines.push(
         '',
         `## Summary`,
         '',
         `- **Total Documented:** ${report.totalEntries}`,
         `- **Total Extracted:** ${report.totalExtracted}`,
         `- **Total Gaps:** ${report.totalGaps}`,
         ''
       );
     } else {
       lines.push(
         '| Domain | Entries |',
         '| ------ | ------- |'
       );
       for (const domain of report.domains) {
         lines.push(`| ${domain.domain} | ${domain.entryCount} |`);
       }
       lines.push('', `## Total Entries: ${report.totalEntries}`, '');
     }

     await fs.writeFile(path.join(gapsDir, 'gaps.md'), lines.join('\n'), 'utf-8');
   }
   ```

2. Run: `cd packages/graph && npx tsc --noEmit` — expect success.
3. Run: `cd packages/graph && npx vitest run tests/integration/knowledge-pipeline.test.ts` — all 11 existing tests should still pass (backward compatibility).
4. Commit: `feat(graph): update writeGapReport for differential format with fallback`

### Task 4: Export GapEntry from index.ts

**Depends on:** Task 1 | **Files:** `packages/graph/src/index.ts`

1. In `packages/graph/src/index.ts`, find the existing export block:
   ```typescript
   export type {
     StagedEntry,
     GapReport,
     DomainCoverage,
     AggregateResult,
   } from './ingest/KnowledgeStagingAggregator.js';
   ```
2. Add `GapEntry` to the list:
   ```typescript
   export type {
     StagedEntry,
     GapEntry,
     GapReport,
     DomainCoverage,
     AggregateResult,
   } from './ingest/KnowledgeStagingAggregator.js';
   ```
3. Run: `cd packages/graph && npx tsc --noEmit` — expect success.
4. Commit: `feat(graph): export GapEntry type from package index`

### Task 5: Add integration tests for differential gap report

**Depends on:** Tasks 2, 3, 4 | **Files:** `packages/graph/tests/integration/knowledge-pipeline.test.ts`

1. Add `GraphStore` to the imports at the top (already imported on line 6).
2. After the existing `generates gap report with per-domain coverage` test block (around line 135), add a new `describe` block:

   ```typescript
   describe('differential gap report', () => {
     let tmpDir: string;

     beforeEach(async () => {
       tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'diff-gap-'));
     });

     afterEach(async () => {
       try {
         await fs.rm(tmpDir, { recursive: true });
       } catch {
         // best-effort cleanup
       }
     });

     it('produces differential report when store is provided', async () => {
       // Set up docs/knowledge/ with one documented entry
       const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
       await fs.mkdir(path.join(knowledgeDir, 'payments'), { recursive: true });
       await fs.writeFile(
         path.join(knowledgeDir, 'payments', 'refund-rules.md'),
         '---\ntype: business_rule\ndomain: payments\n---\n# Refund Rules\nRefund within 30 days'
       );

       // Set up graph store with 3 nodes in payments domain (one matches doc)
       const gapStore = new GraphStore();
       gapStore.addNode({
         id: 'extracted:payments:refund-rules',
         type: 'business_rule',
         name: 'Refund Rules',
         metadata: { domain: 'payments', source: 'extractor' },
         content: 'Refund within 30 days for all products',
       });
       gapStore.addNode({
         id: 'extracted:payments:chargeback-policy',
         type: 'business_rule',
         name: 'Chargeback Policy',
         metadata: { domain: 'payments', source: 'extractor' },
         content: 'Chargebacks are handled within 14 business days',
       });
       gapStore.addNode({
         id: 'extracted:payments:payment-sla',
         type: 'business_process',
         name: 'Payment SLA',
         metadata: { domain: 'payments', source: 'diagram' },
         content: 'All payments settle within 24 hours',
       });

       const aggregator = new KnowledgeStagingAggregator(tmpDir);
       const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

       expect(report.totalEntries).toBe(1);
       expect(report.totalExtracted).toBe(3);
       expect(report.totalGaps).toBe(2);

       const payments = report.domains.find((d) => d.domain === 'payments')!;
       expect(payments.entryCount).toBe(1);
       expect(payments.extractedCount).toBe(3);
       expect(payments.gapCount).toBe(2);
       expect(payments.gapEntries).toHaveLength(2);

       const gapNames = payments.gapEntries.map((e) => e.name).sort();
       expect(gapNames).toEqual(['Chargeback Policy', 'Payment SLA']);
     });

     it('returns backward-compatible result when store is not provided', async () => {
       const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
       await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
       await fs.writeFile(
         path.join(knowledgeDir, 'auth', 'session-policy.md'),
         '---\ntype: business_rule\ndomain: auth\n---\n# Session Policy\n24h session timeout'
       );

       const aggregator = new KnowledgeStagingAggregator(tmpDir);
       const report = await aggregator.generateGapReport(knowledgeDir);

       expect(report.totalEntries).toBe(1);
       expect(report.totalExtracted).toBe(0);
       expect(report.totalGaps).toBe(0);

       const auth = report.domains.find((d) => d.domain === 'auth')!;
       expect(auth.entryCount).toBe(1);
       expect(auth.extractedCount).toBe(0);
       expect(auth.gapCount).toBe(0);
       expect(auth.gapEntries).toHaveLength(0);
     });

     it('gap entries include correct details', async () => {
       const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
       await fs.mkdir(path.join(knowledgeDir, 'billing'), { recursive: true });

       // No docs — all extracted nodes are gaps
       const gapStore = new GraphStore();
       gapStore.addNode({
         id: 'extracted:billing:invoice-gen',
         type: 'business_process',
         name: 'Invoice Generation',
         metadata: { domain: 'billing', source: 'extractor' },
         content: 'Generate invoices on the 1st of each month for all active subscriptions',
       });
       gapStore.addNode({
         id: 'extracted:billing:thin-finding',
         type: 'business_fact',
         name: 'Tax Rate',
         metadata: { domain: 'billing', source: 'linker' },
         content: 'short',
       });

       const aggregator = new KnowledgeStagingAggregator(tmpDir);
       const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

       expect(report.totalGaps).toBe(2);
       const billing = report.domains.find((d) => d.domain === 'billing')!;
       expect(billing.entryCount).toBe(0);
       expect(billing.extractedCount).toBe(2);

       const invoiceGap = billing.gapEntries.find((e) => e.name === 'Invoice Generation')!;
       expect(invoiceGap.nodeId).toBe('extracted:billing:invoice-gen');
       expect(invoiceGap.nodeType).toBe('business_process');
       expect(invoiceGap.source).toBe('extractor');
       expect(invoiceGap.hasContent).toBe(true);

       const thinGap = billing.gapEntries.find((e) => e.name === 'Tax Rate')!;
       expect(thinGap.hasContent).toBe(false); // 'short' is < 10 chars
       expect(thinGap.source).toBe('linker');
     });

     it('writeGapReport renders differential table when extracted data present', async () => {
       const aggregator = new KnowledgeStagingAggregator(tmpDir);

       const report: import('../../src/ingest/KnowledgeStagingAggregator.js').GapReport = {
         domains: [
           {
             domain: 'payments',
             entryCount: 3,
             extractedCount: 15,
             gapCount: 12,
             gapEntries: [],
           },
         ],
         totalEntries: 3,
         totalExtracted: 15,
         totalGaps: 12,
         generatedAt: '2026-04-25T00:00:00.000Z',
       };

       await aggregator.writeGapReport(report);
       const content = await fs.readFile(
         path.join(tmpDir, '.harness', 'knowledge', 'gaps.md'),
         'utf-8'
       );

       expect(content).toContain('| Domain | Documented | Extracted | Gaps |');
       expect(content).toContain('| payments | 3 | 15 | 12 |');
       expect(content).toContain('**Total Gaps:** 12');
       expect(content).not.toContain('| Domain | Entries |');
     });

     it('writeGapReport renders legacy table when no extracted data', async () => {
       const aggregator = new KnowledgeStagingAggregator(tmpDir);

       const report: import('../../src/ingest/KnowledgeStagingAggregator.js').GapReport = {
         domains: [
           {
             domain: 'auth',
             entryCount: 2,
             extractedCount: 0,
             gapCount: 0,
             gapEntries: [],
           },
         ],
         totalEntries: 2,
         totalExtracted: 0,
         totalGaps: 0,
         generatedAt: '2026-04-25T00:00:00.000Z',
       };

       await aggregator.writeGapReport(report);
       const content = await fs.readFile(
         path.join(tmpDir, '.harness', 'knowledge', 'gaps.md'),
         'utf-8'
       );

       expect(content).toContain('| Domain | Entries |');
       expect(content).toContain('| auth | 2 |');
       expect(content).toContain('Total Entries: 2');
       expect(content).not.toContain('Extracted');
     });

     it('name matching is case-insensitive', async () => {
       const knowledgeDir = path.join(tmpDir, 'docs', 'knowledge');
       await fs.mkdir(path.join(knowledgeDir, 'auth'), { recursive: true });
       await fs.writeFile(
         path.join(knowledgeDir, 'auth', 'session-policy.md'),
         '---\ntype: business_rule\ndomain: auth\n---\n# Session Policy\n24h session timeout'
       );

       const gapStore = new GraphStore();
       gapStore.addNode({
         id: 'extracted:auth:session-policy',
         type: 'business_rule',
         name: 'session policy', // lowercase — should still match
         metadata: { domain: 'auth', source: 'extractor' },
         content: '24h session timeout policy for all users',
       });

       const aggregator = new KnowledgeStagingAggregator(tmpDir);
       const report = await aggregator.generateGapReport(knowledgeDir, gapStore);

       expect(report.totalGaps).toBe(0);
       const auth = report.domains.find((d) => d.domain === 'auth')!;
       expect(auth.gapEntries).toHaveLength(0);
     });
   });
   ```

3. Run: `cd packages/graph && npx vitest run tests/integration/knowledge-pipeline.test.ts` — all tests (existing 11 + new 6) should pass.
4. Commit: `test(graph): add integration tests for differential gap report`
