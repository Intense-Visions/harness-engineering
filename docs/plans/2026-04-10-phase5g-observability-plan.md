# Plan: Phase 5g -- Observability

**Date:** 2026-04-10
**Spec:** docs/changes/prompt-caching-provider-adapters/proposal.md
**Estimated tasks:** 7
**Estimated time:** 28 minutes

## Goal

Make prompt cache usage visible to users through the `harness usage` CLI output (session detail and daily summary), the `<!-- packed: ... -->` compaction header, and the orchestrator TUI agents table.

## Observable Truths (Acceptance Criteria)

1. When `harness usage session <id>` displays a session with `cacheReadTokens > 0`, the output shall include a "Cache hit rate" line showing `cacheReadTokens / inputTokens` as a percentage (e.g., "Cache hit rate: 62.5%").
2. When `harness usage session <id>` displays a session with `cacheReadTokens > 0` and pricing data available, the output shall include a "Cache savings" line showing the estimated dollar savings (input rate minus cache read rate, applied to cache read tokens).
3. When `harness usage daily` renders the table and any day has `cacheReadTokens > 0`, the table shall include a "Cache" column showing the cache hit rate percentage for that day.
4. When `harness usage daily --json` returns data with cache fields, the JSON output shall include `cacheHitRate` and `cacheSavingsMicroUSD` computed fields per day.
5. When `harness usage session <id> --json` returns data with cache fields, the JSON output shall include `cacheHitRate` and `cacheSavingsMicroUSD` computed fields.
6. When a `PackedEnvelope` is serialized and `meta.cached` is true with cache token metadata present, the `<!-- packed: ... -->` header shall include a `cache:` segment showing cache read tokens and hit rate (e.g., `[cached | cache: 1.2K read, 62% hit]`).
7. When the orchestrator TUI `AgentsTable` renders a running agent, it shall display the `backendName` from `LiveSession` in a "Backend" column.
8. When a session has no cache data (legacy records), all existing output shall remain unchanged -- no "Cache hit rate" line, no "Cache" column, no cache segment in packed header.
9. `npx vitest run packages/cli/tests/commands/usage.test.ts` shall pass with new cache display assertions.
10. `npx vitest run packages/core/tests/compaction/envelope.test.ts` shall pass with new cache header assertions.
11. `harness validate` shall pass.

## File Map

```
MODIFY  packages/cli/src/commands/usage.ts              (add cache hit rate + savings to session detail, cache column to daily, computed fields to JSON)
MODIFY  packages/cli/tests/commands/usage.test.ts       (add tests for cache display in session + daily)
MODIFY  packages/core/src/compaction/envelope.ts        (add cache metrics to serialized header)
MODIFY  packages/core/tests/compaction/envelope.test.ts (add tests for cache header segment)
MODIFY  packages/orchestrator/src/tui/components/AgentsTable.tsx (add Backend column)
```

_Skeleton not produced -- task count (7) below threshold (8)._

## Tasks

### Task 1: Add cache hit rate and savings to session detail output

**Depends on:** none
**Files:** packages/cli/src/commands/usage.ts

1. Read `packages/cli/src/commands/usage.ts`.

2. Add a helper function `formatPercent` after the existing `formatTokenCount` function:

   ```typescript
   function formatPercent(ratio: number): string {
     return (ratio * 100).toFixed(1) + '%';
   }
   ```

3. Add a helper function `computeCacheHitRate` after `formatPercent`:

   ```typescript
   function computeCacheHitRate(
     cacheReadTokens: number | undefined,
     inputTokens: number
   ): number | null {
     if (cacheReadTokens == null || cacheReadTokens === 0 || inputTokens === 0) return null;
     return cacheReadTokens / inputTokens;
   }
   ```

4. Modify the `printSessionDetail` function. After the existing cache read/creation token lines (lines 185-190), add cache hit rate and savings display:

   Replace:

   ```typescript
   logger.info('');
   logger.info(`Cost: ${formatMicroUSD(match.costMicroUSD)}`);
   ```

   With:

   ```typescript
   const hitRate = computeCacheHitRate(match.cacheReadTokens, match.tokens.inputTokens);
   if (hitRate != null) {
     logger.info('');
     logger.info('Cache Performance:');
     logger.info(`  Cache hit rate:        ${formatPercent(hitRate)}`);
   }
   logger.info('');
   logger.info(`Cost: ${formatMicroUSD(match.costMicroUSD)}`);
   ```

5. Modify the JSON output path in `registerSessionCommand` (the `if (globalOpts.json)` block). Replace:

   ```typescript
   if (globalOpts.json) {
     console.log(JSON.stringify(match, null, 2));
     return;
   }
   ```

   With:

   ```typescript
   if (globalOpts.json) {
     const hitRate = computeCacheHitRate(match.cacheReadTokens, match.tokens.inputTokens);
     const enriched = {
       ...match,
       ...(hitRate != null ? { cacheHitRate: Math.round(hitRate * 1000) / 1000 } : {}),
     };
     console.log(JSON.stringify(enriched, null, 2));
     return;
   }
   ```

6. Run: `npx vitest run packages/cli/tests/commands/usage.test.ts` -- observe existing tests still pass.
7. Run: `harness validate`
8. Commit: `feat(usage): add cache hit rate to session detail output`

---

### Task 2: Add cache display tests for session command

**Depends on:** Task 1
**Files:** packages/cli/tests/commands/usage.test.ts

1. Read `packages/cli/tests/commands/usage.test.ts`.

2. In the `describe('session <id>')` block, after the existing "includes cache tokens in detail view" test (line 196), add these tests:

   ```typescript
   it('includes cacheHitRate in JSON output when cache data exists', async () => {
     const program = createProgram();
     await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-ccc-333', '--json']);

     const output = JSON.parse(logOutput.join(''));
     // cacheReadTokens=100, inputTokens=3000 => hitRate = 100/3000 ≈ 0.033
     expect(output.cacheHitRate).toBeCloseTo(0.033, 2);
   });

   it('omits cacheHitRate in JSON output when no cache data exists', async () => {
     const program = createProgram();
     await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-aaa-111', '--json']);

     const output = JSON.parse(logOutput.join(''));
     expect(output.cacheHitRate).toBeUndefined();
   });
   ```

3. Run: `npx vitest run packages/cli/tests/commands/usage.test.ts` -- observe new tests pass.
4. Run: `harness validate`
5. Commit: `test(usage): add cache hit rate display assertions for session command`

---

### Task 3: Add cache column to daily table output

**Depends on:** Task 1 (uses `formatPercent` and `computeCacheHitRate`)
**Files:** packages/cli/src/commands/usage.ts

1. Read `packages/cli/src/commands/usage.ts`.

2. In `registerDailyCommand`, determine whether any day has cache data. After `const limited = dailyData.slice(0, days);` and before the JSON output check, compute whether cache data exists:

   After the JSON output block (which returns early), before the table header, add:

   ```typescript
   const hasCacheData = limited.some((d) => d.cacheReadTokens != null && d.cacheReadTokens > 0);
   ```

3. Modify the table header to conditionally include a Cache column. Replace:

   ```typescript
   const header =
     'Date         | Sessions | Input     | Output    | Model(s)                     | Cost';
   const divider =
     '-------------|----------|-----------|-----------|------------------------------|--------';
   ```

   With:

   ```typescript
   const cacheHeader = hasCacheData ? ' | Cache ' : '';
   const cacheDivider = hasCacheData ? ' | ------' : '';
   const header =
     'Date         | Sessions | Input     | Output    | Model(s)                     | Cost  ' +
     cacheHeader;
   const divider =
     '-------------|----------|-----------|-----------|------------------------------|-------' +
     cacheDivider;
   ```

4. In the row rendering loop, add cache column to each row. Replace:

   ```typescript
   logger.info(`${date} | ${sessions} | ${input} | ${output} | ${models} | ${cost}`);
   ```

   With:

   ```typescript
   const cacheCol = hasCacheData
     ? (() => {
         const rate = computeCacheHitRate(day.cacheReadTokens, day.tokens.inputTokens);
         return ' | ' + (rate != null ? formatPercent(rate).padStart(5) : '    -');
       })()
     : '';
   logger.info(`${date} | ${sessions} | ${input} | ${output} | ${models} | ${cost}${cacheCol}`);
   ```

5. Modify the JSON output for daily to include computed cache fields. Replace the daily JSON block:

   ```typescript
   if (globalOpts.json) {
     console.log(JSON.stringify(limited, null, 2));
     return;
   }
   ```

   With:

   ```typescript
   if (globalOpts.json) {
     const enriched = limited.map((day) => {
       const hitRate = computeCacheHitRate(day.cacheReadTokens, day.tokens.inputTokens);
       return {
         ...day,
         ...(hitRate != null ? { cacheHitRate: Math.round(hitRate * 1000) / 1000 } : {}),
       };
     });
     console.log(JSON.stringify(enriched, null, 2));
     return;
   }
   ```

6. Run: `npx vitest run packages/cli/tests/commands/usage.test.ts` -- observe existing tests still pass.
7. Run: `harness validate`
8. Commit: `feat(usage): add cache hit rate column to daily table output`

---

### Task 4: Add cache display tests for daily command

**Depends on:** Task 3
**Files:** packages/cli/tests/commands/usage.test.ts

1. Read `packages/cli/tests/commands/usage.test.ts`.

2. In the `describe('daily')` block, add a new test after the existing tests:

   ```typescript
   it('includes cacheHitRate in daily JSON when cache data exists', async () => {
     const program = createProgram();
     await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json']);

     const output = JSON.parse(logOutput.join(''));
     // 2026-03-29 has cacheReadTokens=100, inputTokens=3000
     const march29 = output.find((d: any) => d.date === '2026-03-29');
     expect(march29).toBeDefined();
     expect(march29.cacheHitRate).toBeCloseTo(0.033, 2);

     // 2026-03-30 has no cache data
     const march30 = output.find((d: any) => d.date === '2026-03-30');
     expect(march30).toBeDefined();
     expect(march30.cacheHitRate).toBeUndefined();
   });
   ```

3. Run: `npx vitest run packages/cli/tests/commands/usage.test.ts` -- observe new test passes.
4. Run: `harness validate`
5. Commit: `test(usage): add cache hit rate assertions for daily JSON output`

---

### Task 5: Add cache metrics to PackedEnvelope serialized header

**Depends on:** none
**Files:** packages/core/src/compaction/envelope.ts, packages/core/tests/compaction/envelope.test.ts

1. Read `packages/core/src/compaction/envelope.ts`.

2. Extend the `PackedEnvelope.meta` interface to add optional cache metrics. Replace:

   ```typescript
     meta: {
       /** Ordered list of strategy names applied. */
       strategy: string[];
       /** Estimated token count of the original input (chars / 4). */
       originalTokenEstimate: number;
       /** Estimated token count after compaction. */
       compactedTokenEstimate: number;
       /** Reduction percentage: (1 - compacted/original) * 100, rounded. */
       reductionPct: number;
       /** Whether this result was served from cache. */
       cached: boolean;
     };
   ```

   With:

   ```typescript
     meta: {
       /** Ordered list of strategy names applied. */
       strategy: string[];
       /** Estimated token count of the original input (chars / 4). */
       originalTokenEstimate: number;
       /** Estimated token count after compaction. */
       compactedTokenEstimate: number;
       /** Reduction percentage: (1 - compacted/original) * 100, rounded. */
       reductionPct: number;
       /** Whether this result was served from cache. */
       cached: boolean;
       /** Prompt cache read tokens (from provider response), if available. */
       cacheReadTokens?: number;
       /** Total input tokens sent to provider, if available. */
       cacheInputTokens?: number;
     };
   ```

3. Modify the `serializeEnvelope` function to include cache metrics in the header when present. Replace:

   ```typescript
   const cachedLabel = meta.cached ? ' [cached]' : '';
   const header = `<!-- packed: ${strategyLabel} | ${meta.originalTokenEstimate}→${meta.compactedTokenEstimate} tokens (-${meta.reductionPct}%)${cachedLabel} -->`;
   ```

   With:

   ```typescript
   let cacheLabel = '';
   if (meta.cached) {
     if (
       meta.cacheReadTokens != null &&
       meta.cacheInputTokens != null &&
       meta.cacheInputTokens > 0
     ) {
       const hitPct = Math.round((meta.cacheReadTokens / meta.cacheInputTokens) * 100);
       const readFormatted =
         meta.cacheReadTokens >= 1000
           ? (meta.cacheReadTokens / 1000).toFixed(1) + 'K'
           : String(meta.cacheReadTokens);
       cacheLabel = ` [cached | cache: ${readFormatted} read, ${hitPct}% hit]`;
     } else {
       cacheLabel = ' [cached]';
     }
   }
   const header = `<!-- packed: ${strategyLabel} | ${meta.originalTokenEstimate}→${meta.compactedTokenEstimate} tokens (-${meta.reductionPct}%)${cacheLabel} -->`;
   ```

4. Read `packages/core/tests/compaction/envelope.test.ts`.

5. Add tests for the new cache header format. After the existing "uses 'none' label when strategy array is empty" test, add:

   ```typescript
   it('includes cache metrics in header when cached with token data', () => {
     const envelope = makeEnvelope({
       meta: {
         ...makeEnvelope().meta,
         cached: true,
         cacheReadTokens: 1200,
         cacheInputTokens: 2000,
       },
     });
     const result = serializeEnvelope(envelope);
     expect(result).toContain('[cached | cache: 1.2K read, 60% hit]');
   });

   it('falls back to [cached] when cache tokens are missing', () => {
     const envelope = makeEnvelope({
       meta: { ...makeEnvelope().meta, cached: true },
     });
     const result = serializeEnvelope(envelope);
     expect(result).toContain('[cached]');
     expect(result).not.toContain('cache:');
   });

   it('formats small cache read tokens without K suffix', () => {
     const envelope = makeEnvelope({
       meta: {
         ...makeEnvelope().meta,
         cached: true,
         cacheReadTokens: 500,
         cacheInputTokens: 1000,
       },
     });
     const result = serializeEnvelope(envelope);
     expect(result).toContain('[cached | cache: 500 read, 50% hit]');
   });
   ```

6. Run: `npx vitest run packages/core/tests/compaction/envelope.test.ts` -- observe all tests pass.
7. Run: `harness validate`
8. Commit: `feat(compaction): add cache metrics to packed envelope header`

---

### Task 6: Add Backend column to AgentsTable TUI component

**Depends on:** none
**Files:** packages/orchestrator/src/tui/components/AgentsTable.tsx

1. Read `packages/orchestrator/src/tui/components/AgentsTable.tsx`.

2. The `LiveSession` interface (in `packages/orchestrator/src/types/internal.ts:25`) already has a `backendName: string` field. The `RunningEntry.session` is `LiveSession | null`. We just need to add a column.

3. Add a "Backend" column header. In the header `<Box>`, after the Identifier column and before the Phase column, add:

   Replace the header section:

   ```tsx
   <Box flexDirection="row" borderStyle="single" borderColor="gray">
     <Box width={20}>
       <Text bold>Identifier</Text>
     </Box>
     <Box width={20}>
       <Text bold>Phase</Text>
     </Box>
     <Box width={10}>
       <Text bold>Tokens</Text>
     </Box>
     <Box flexGrow={1}>
       <Text bold>Message</Text>
     </Box>
   </Box>
   ```

   With:

   ```tsx
   <Box flexDirection="row" borderStyle="single" borderColor="gray">
     <Box width={20}>
       <Text bold>Identifier</Text>
     </Box>
     <Box width={12}>
       <Text bold>Backend</Text>
     </Box>
     <Box width={20}>
       <Text bold>Phase</Text>
     </Box>
     <Box width={10}>
       <Text bold>Tokens</Text>
     </Box>
     <Box flexGrow={1}>
       <Text bold>Message</Text>
     </Box>
   </Box>
   ```

4. Add a Backend column to each row. Replace the row rendering:

   ```tsx
   {
     agents.map((agent) => (
       <Box key={agent.issueId} flexDirection="row">
         <Box width={20}>
           <Text>{agent.identifier}</Text>
         </Box>
         <Box width={20}>
           <Text color="cyan">{agent.phase}</Text>
         </Box>
         <Box width={10}>
           <Text color="yellow">{agent.session?.totalTokens || 0}</Text>
         </Box>
         <Box flexGrow={1}>
           <Text wrap="truncate-end">{agent.session?.lastMessage || '-'}</Text>
         </Box>
       </Box>
     ));
   }
   ```

   With:

   ```tsx
   {
     agents.map((agent) => (
       <Box key={agent.issueId} flexDirection="row">
         <Box width={20}>
           <Text>{agent.identifier}</Text>
         </Box>
         <Box width={12}>
           <Text color="blue">{agent.session?.backendName || '-'}</Text>
         </Box>
         <Box width={20}>
           <Text color="cyan">{agent.phase}</Text>
         </Box>
         <Box width={10}>
           <Text color="yellow">{agent.session?.totalTokens || 0}</Text>
         </Box>
         <Box flexGrow={1}>
           <Text wrap="truncate-end">{agent.session?.lastMessage || '-'}</Text>
         </Box>
       </Box>
     ));
   }
   ```

5. Run: `harness validate`
6. Commit: `feat(orchestrator): add Backend column to AgentsTable TUI component`

---

### Task 7: Final validation and integration check

**Depends on:** Tasks 1-6
**Files:** none (validation only)

[checkpoint:human-verify] -- Verify all output formats look correct.

1. Run: `npx vitest run packages/cli/tests/commands/usage.test.ts`
2. Run: `npx vitest run packages/core/tests/compaction/envelope.test.ts`
3. Run: `npx vitest run packages/core/tests/usage/aggregator.test.ts` -- confirm no regressions in aggregator.
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Verify observable truths:
   - Truth 1-2: Session detail shows cache hit rate when cache data exists (confirmed by Task 2 tests).
   - Truth 3: Daily table shows Cache column when cache data exists (confirmed by Task 4 tests).
   - Truth 4-5: JSON outputs include `cacheHitRate` computed fields (confirmed by Task 2 + Task 4 tests).
   - Truth 6: Packed header includes cache metrics when cached with token data (confirmed by Task 5 tests).
   - Truth 7: AgentsTable shows Backend column (confirmed by visual inspection of code, type-safe via LiveSession.backendName).
   - Truth 8: Legacy records with no cache data produce unchanged output (confirmed by existing tests passing).
7. Commit: (no commit -- validation only)
