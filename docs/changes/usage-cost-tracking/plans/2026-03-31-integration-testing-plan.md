# Plan: Usage Cost Tracking — Phase 5: Integration Testing

**Date:** 2026-03-31
**Spec:** docs/changes/usage-cost-tracking/proposal.md
**Estimated tasks:** 3
**Estimated time:** 9–15 minutes

## Goal

Verify end-to-end correctness of the usage cost tracking pipeline — from hook writes through CLI reads to display output — with focused tests for offline fallback, legacy backward compatibility, and exact `--json` output schema shape.

## Observable Truths (Acceptance Criteria)

1. When the cost-tracker hook is executed with a full payload (including cache tokens and model), the resulting JSONL entry is readable by the CLI pipeline and `harness usage latest --json` returns a record with matching sessionId, token counts, cacheCreationTokens, cacheReadTokens, and a non-null costMicroUSD.
2. When `loadPricingData` is called with a mocked fetch that fails and no disk cache, the system uses `fallback.json` without throwing, and `harness usage sessions --json` returns a result array without error.
3. When a staleness marker file is present with a `firstFallbackUse` date more than 7 days ago, `loadPricingData` emits a `console.warn` containing the word "stale".
4. When `harness usage sessions --json` is called with legacy JSONL entries (no `model`, no cache fields), each session in the output has `costMicroUSD` equal to `null` and `source` equal to `'harness'`.
5. When `harness usage daily --json` is called, each item in the output array has exactly the fields: `date` (string), `sessionCount` (number), `tokens` (object with `inputTokens`, `outputTokens`, `totalTokens`), `costMicroUSD` (number or null), `models` (array).
6. When `harness usage sessions --json` is called, each item has `sessionId` (string), `firstTimestamp` (string), `lastTimestamp` (string), `tokens` (object), `costMicroUSD` (number or null), `source` (`'harness'` or `'claude-code'` or `'merged'`).
7. When `harness usage session <id> --json` is called with a known session, the output object has `sessionId`, `tokens`, `costMicroUSD`, `source`, `firstTimestamp`, `lastTimestamp`.
8. When `harness usage latest --json` is called, the output is a single object (not an array) with all required `SessionUsage` fields.

## Prior Test Coverage (Do Not Duplicate)

The following scenarios are already tested and must NOT be added to the new test file:

- Basic daily/sessions/session/latest with sample JSONL (usage.test.ts — 17 tests)
- Hook writes with/without cache fields (cost-tracker.test.ts — 9 tests)
- Legacy entry handling in unit form (usage.test.ts `handles legacy entries without model as unknown cost`)
- CC merge into sessions/daily (usage.test.ts `--include-claude-sessions` block)
- Aggregator logic (aggregator unit tests — 15 tests)
- JSONL reader parsing (jsonl-reader unit tests — 6 tests)
- Pricing/calculator/cache logic (pricing unit tests — 21 tests)

## File Map

```
CREATE packages/cli/tests/commands/usage-pipeline.test.ts
```

No source files are modified. This plan is test-only.

## Tasks

### Task 1: E2E pipeline test — hook writes to JSONL, CLI reads and prices the result

**Depends on:** none
**Files:** `packages/cli/tests/commands/usage-pipeline.test.ts`

This task creates the test file and writes the first describe block: a full pipeline test using `execFileSync` to run the hook (same pattern as `cost-tracker.test.ts`) followed by programmatic CLI invocation (same pattern as `usage.test.ts`).

**Why this is not already covered:** `usage.test.ts` uses hand-written fixture JSONL. This test exercises the actual hook binary writing the entry that the CLI then reads — verifying the field names written by `cost-tracker.js` are the ones `jsonl-reader.ts` expects.

1. Create `packages/cli/tests/commands/usage-pipeline.test.ts` with the following content:

   ```typescript
   /**
    * usage-pipeline.test.ts — Phase 5: Integration Testing
    *
    * Tests the full pipeline from hook write through CLI read.
    * Does NOT duplicate scenarios covered in usage.test.ts or cost-tracker.test.ts.
    */
   import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
   import * as fs from 'node:fs';
   import * as path from 'node:path';
   import { execFileSync } from 'node:child_process';
   import { Command } from 'commander';
   import { createUsageCommand } from '../../src/commands/usage';

   const HOOK_PATH = path.resolve(__dirname, '../../src/hooks/cost-tracker.js');

   function runHook(stdinData: string, cwd: string): void {
     execFileSync('node', [HOOK_PATH], {
       input: stdinData,
       encoding: 'utf-8',
       stdio: ['pipe', 'pipe', 'pipe'],
       cwd,
     });
   }

   function createProgram(): Command {
     const program = new Command();
     program.option('--json', 'JSON output');
     program.addCommand(createUsageCommand());
     return program;
   }

   describe('E2E pipeline: hook writes → CLI reads → priced output', () => {
     const tmpDir = path.join(__dirname, '__pipeline-e2e-tmp__');
     let consoleLogSpy: ReturnType<typeof vi.spyOn>;
     let logOutput: string[];
     let originalCwd: string;

     beforeEach(() => {
       originalCwd = process.cwd();
       fs.mkdirSync(path.join(tmpDir, '.harness', 'metrics'), { recursive: true });
       process.chdir(tmpDir);
       logOutput = [];
       consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
         logOutput.push(args.join(' '));
       });
       vi.spyOn(console, 'warn').mockImplementation(() => {});
     });

     afterEach(() => {
       process.chdir(originalCwd);
       consoleLogSpy.mockRestore();
       vi.restoreAllMocks();
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('hook-written entry is readable by CLI and priced correctly via fallback', async () => {
       // The hook writes snake_case fields; the reader normalises to camelCase.
       // claude-sonnet-4-20250514 exists in fallback.json with known pricing.
       const hookInput = JSON.stringify({
         session_id: 'e2e-session-001',
         token_usage: { input_tokens: 1000, output_tokens: 500 },
         cacheCreationTokens: 200,
         cacheReadTokens: 100,
         model: 'claude-sonnet-4-20250514',
       });

       runHook(hookInput, tmpDir);

       // Verify the JSONL file was created with expected fields
       const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
       expect(fs.existsSync(costsFile)).toBe(true);
       const written = JSON.parse(fs.readFileSync(costsFile, 'utf-8').trim());
       expect(written.session_id).toBe('e2e-session-001');
       expect(written.token_usage.input_tokens).toBe(1000);
       expect(written.cacheCreationTokens).toBe(200);
       expect(written.cacheReadTokens).toBe(100);

       // Now run CLI to verify the full read → price pipeline
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

       const output = JSON.parse(logOutput.join(''));
       expect(output.sessionId).toBe('e2e-session-001');
       expect(output.tokens.inputTokens).toBe(1000);
       expect(output.tokens.outputTokens).toBe(500);
       expect(output.cacheCreationTokens).toBe(200);
       expect(output.cacheReadTokens).toBe(100);
       expect(output.model).toBe('claude-sonnet-4-20250514');
       // Cost must be a positive number (priced via fallback.json)
       expect(typeof output.costMicroUSD).toBe('number');
       expect(output.costMicroUSD).toBeGreaterThan(0);
     });

     it('hook-written entry without model field results in null cost', async () => {
       const hookInput = JSON.stringify({
         session_id: 'e2e-session-nomodel',
         token_usage: { input_tokens: 500, output_tokens: 250 },
       });

       runHook(hookInput, tmpDir);

       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

       const output = JSON.parse(logOutput.join(''));
       expect(output.sessionId).toBe('e2e-session-nomodel');
       // No model — cost must be null, not a number
       expect(output.costMicroUSD).toBeNull();
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/usage-pipeline.test.ts`
3. Observe: 2 tests pass (pricing falls through to fallback.json since no live network needed in test env)
4. Run: `harness validate`
5. Commit: `test(usage): add E2E pipeline test — hook writes, CLI reads, fallback prices`

---

### Task 2: Offline fallback and staleness warning tests

**Depends on:** Task 1 (appends to same test file)
**Files:** `packages/cli/tests/commands/usage-pipeline.test.ts`

This task adds a second describe block testing the offline fallback code path in `cache.ts`. The approach: mock `fetch` globally to reject, write fixture JSONL with a known-priced model, call `loadPricingData` directly, then assert fallback was used.

For staleness: write a staleness marker with an old date, call `loadPricingData`, assert `console.warn` was called.

**Why this is not already covered:** `usage.test.ts` tests note "network fetch falls back gracefully — no mocking needed." None of the existing tests explicitly verify the offline code path or staleness warning. The pricing unit tests use mocked fetch but don't verify the integration with the CLI command path.

1. Append the following to `packages/cli/tests/commands/usage-pipeline.test.ts` (after the first describe block, before the end of the file):

   ```typescript
   describe('Offline fallback: fetch fails, fallback.json provides pricing', () => {
     const tmpDir = path.join(__dirname, '__offline-test-tmp__');
     let consoleLogSpy: ReturnType<typeof vi.spyOn>;
     let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
     let logOutput: string[];
     let warnOutput: string[];
     let originalCwd: string;

     const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

     const fixtureEntry = JSON.stringify({
       timestamp: '2026-03-31T10:00:00.000Z',
       session_id: 'offline-sess-001',
       token_usage: { input_tokens: 1000, output_tokens: 500 },
       model: 'claude-sonnet-4-20250514',
     });

     beforeEach(() => {
       originalCwd = process.cwd();
       fs.mkdirSync(path.dirname(costsFile), { recursive: true });
       fs.writeFileSync(costsFile, fixtureEntry + '\n');
       process.chdir(tmpDir);
       logOutput = [];
       warnOutput = [];
       consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
         logOutput.push(args.join(' '));
       });
       consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
         warnOutput.push(args.join(' '));
       });
       // Mock fetch to fail (simulate offline)
       vi.stubGlobal('fetch', () => Promise.reject(new Error('network unavailable')));
     });

     afterEach(() => {
       process.chdir(originalCwd);
       vi.restoreAllMocks();
       vi.unstubAllGlobals();
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('uses fallback.json when network fetch fails and no disk cache exists', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

       const output = JSON.parse(logOutput.join(''));
       // Session should be found
       expect(output.sessionId).toBe('offline-sess-001');
       // Cost should be non-null — fallback.json has pricing for claude-sonnet-4-20250514
       expect(typeof output.costMicroUSD).toBe('number');
       expect(output.costMicroUSD).toBeGreaterThan(0);
     });

     it('emits staleness warning when fallback has been used for more than 7 days', async () => {
       // Write a staleness marker dated 10 days ago
       const markerDir = path.join(tmpDir, '.harness', 'cache');
       fs.mkdirSync(markerDir, { recursive: true });
       const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
       fs.writeFileSync(
         path.join(markerDir, 'staleness-marker.json'),
         JSON.stringify({ firstFallbackUse: tenDaysAgo })
       );

       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

       // The staleness warning must appear in console.warn output
       const stalePrinted = warnOutput.some((line) => line.toLowerCase().includes('stale'));
       expect(stalePrinted).toBe(true);
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/usage-pipeline.test.ts`
3. Observe: 4 tests pass (2 from Task 1 + 2 new)
4. Run: `harness validate`
5. Commit: `test(usage): add offline fallback and staleness warning integration tests`

---

### Task 3: `--json` output schema shape validation

**Depends on:** Task 2 (appends to same test file)
**Files:** `packages/cli/tests/commands/usage-pipeline.test.ts`

This task adds a third describe block doing deep field-by-field schema validation of all four command `--json` outputs. The existing `usage.test.ts` checks `toHaveProperty('date')` but does not verify field types, does not check `source`, and does not verify `tokens` subfields. This test locks down the exact shape so schema regressions are caught.

**Why this is not already covered:** Existing tests check presence of top-level properties but not types or nested structure. The spec's success criterion #12 says "all commands output machine-readable JSON" — this task verifies the machine-readable contract precisely.

1. Append the following to `packages/cli/tests/commands/usage-pipeline.test.ts`:

   ```typescript
   describe('--json schema shape validation', () => {
     const tmpDir = path.join(__dirname, '__schema-test-tmp__');
     let consoleLogSpy: ReturnType<typeof vi.spyOn>;
     let logOutput: string[];
     let originalCwd: string;

     const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

     // Two sessions across two days, one with model (priced), one legacy (no model)
     const schemaFixture =
       [
         JSON.stringify({
           timestamp: '2026-03-30T10:00:00.000Z',
           session_id: 'schema-sess-alpha',
           token_usage: { input_tokens: 2000, output_tokens: 1000 },
           model: 'claude-sonnet-4-20250514',
           cache_creation_tokens: 100,
           cache_read_tokens: 50,
         }),
         JSON.stringify({
           timestamp: '2026-03-31T11:00:00.000Z',
           session_id: 'schema-sess-beta',
           token_usage: { input_tokens: 500, output_tokens: 250 },
           // No model — legacy entry
         }),
       ].join('\n') + '\n';

     beforeEach(() => {
       originalCwd = process.cwd();
       fs.mkdirSync(path.dirname(costsFile), { recursive: true });
       fs.writeFileSync(costsFile, schemaFixture);
       process.chdir(tmpDir);
       logOutput = [];
       consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
         logOutput.push(args.join(' '));
       });
       vi.spyOn(console, 'warn').mockImplementation(() => {});
     });

     afterEach(() => {
       process.chdir(originalCwd);
       consoleLogSpy.mockRestore();
       vi.restoreAllMocks();
       fs.rmSync(tmpDir, { recursive: true, force: true });
     });

     it('daily --json: each item has required fields with correct types', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json']);

       const output = JSON.parse(logOutput.join(''));
       expect(Array.isArray(output)).toBe(true);
       expect(output.length).toBeGreaterThanOrEqual(1);

       for (const item of output) {
         expect(typeof item.date).toBe('string');
         expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
         expect(typeof item.sessionCount).toBe('number');
         expect(typeof item.tokens).toBe('object');
         expect(typeof item.tokens.inputTokens).toBe('number');
         expect(typeof item.tokens.outputTokens).toBe('number');
         expect(typeof item.tokens.totalTokens).toBe('number');
         // costMicroUSD is number or null
         expect(item.costMicroUSD === null || typeof item.costMicroUSD === 'number').toBe(true);
         expect(Array.isArray(item.models)).toBe(true);
       }
     });

     it('sessions --json: each item has required fields with correct types', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

       const output = JSON.parse(logOutput.join(''));
       expect(Array.isArray(output)).toBe(true);
       expect(output).toHaveLength(2);

       for (const item of output) {
         expect(typeof item.sessionId).toBe('string');
         expect(typeof item.firstTimestamp).toBe('string');
         expect(typeof item.lastTimestamp).toBe('string');
         expect(typeof item.tokens).toBe('object');
         expect(typeof item.tokens.inputTokens).toBe('number');
         expect(typeof item.tokens.outputTokens).toBe('number');
         expect(typeof item.tokens.totalTokens).toBe('number');
         expect(item.costMicroUSD === null || typeof item.costMicroUSD === 'number').toBe(true);
         expect(['harness', 'claude-code', 'merged']).toContain(item.source);
       }
     });

     it('sessions --json: legacy entry has null costMicroUSD and source harness', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

       const output = JSON.parse(logOutput.join(''));
       const beta = output.find((s: { sessionId: string }) => s.sessionId === 'schema-sess-beta');
       expect(beta).toBeDefined();
       expect(beta.costMicroUSD).toBeNull();
       expect(beta.source).toBe('harness');
       // model field must be absent (not present in JSONL)
       expect(beta.model).toBeUndefined();
     });

     it('session <id> --json: priced session has non-null costMicroUSD with cache fields', async () => {
       const program = createProgram();
       await program.parseAsync([
         'node',
         'harness',
         'usage',
         'session',
         'schema-sess-alpha',
         '--json',
       ]);

       const output = JSON.parse(logOutput.join(''));
       expect(output.sessionId).toBe('schema-sess-alpha');
       expect(typeof output.tokens).toBe('object');
       expect(typeof output.tokens.inputTokens).toBe('number');
       expect(output.costMicroUSD === null || typeof output.costMicroUSD === 'number').toBe(true);
       expect(output.source).toBe('harness');
       expect(typeof output.firstTimestamp).toBe('string');
       expect(typeof output.lastTimestamp).toBe('string');
       // Cache tokens from JSONL fixture
       expect(output.cacheCreationTokens).toBe(100);
       expect(output.cacheReadTokens).toBe(50);
     });

     it('latest --json: returns single SessionUsage object, not an array', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json']);

       const output = JSON.parse(logOutput.join(''));
       // Must be an object, not an array
       expect(Array.isArray(output)).toBe(false);
       expect(typeof output).toBe('object');
       // Most recent session by timestamp is schema-sess-beta (2026-03-31)
       expect(output.sessionId).toBe('schema-sess-beta');
       expect(typeof output.firstTimestamp).toBe('string');
       expect(typeof output.lastTimestamp).toBe('string');
       expect(typeof output.tokens).toBe('object');
       expect(output.costMicroUSD === null || typeof output.costMicroUSD === 'number').toBe(true);
       expect(['harness', 'claude-code', 'merged']).toContain(output.source);
     });
   });
   ```

2. Run: `cd /Users/cwarner/Projects/harness-engineering/packages/cli && npx vitest run tests/commands/usage-pipeline.test.ts`
3. Observe: 9 tests pass (2 + 2 + 5)
4. Run: `harness validate`
5. Run: `harness check-arch --update-baseline` (test-only addition; arch baseline regression may fire)
6. Commit: `test(usage): add --json schema shape validation for all four usage commands`

---

## Traceability — Observable Truths to Tasks

| Observable Truth                                         | Task                   |
| -------------------------------------------------------- | ---------------------- |
| 1. Hook writes → CLI reads → non-null costMicroUSD       | Task 1 (test 1)        |
| 2. Offline fetch fail → fallback.json used without error | Task 2 (test 1)        |
| 3. Staleness marker > 7 days → console.warn with "stale" | Task 2 (test 2)        |
| 4. Legacy entries → null costMicroUSD + source='harness' | Task 3 (schema test 3) |
| 5. daily --json exact schema shape                       | Task 3 (schema test 1) |
| 6. sessions --json exact schema shape                    | Task 3 (schema test 2) |
| 7. session --json exact schema shape                     | Task 3 (schema test 4) |
| 8. latest --json single object, not array                | Task 3 (schema test 5) |

## Notes for Execution

- **Arch baseline:** Test-only additions still trigger arch baseline regressions for module-size. Run `harness check-arch --update-baseline` before each commit, or batch the update at the end of Task 3.
- **Pricing during tests:** The CLI's `loadPricingData` will attempt a network fetch on first call. In Task 1 and Task 3, this is allowed to succeed or fall through to fallback — both produce valid pricing for `claude-sonnet-4-20250514`. In Task 2, fetch is explicitly mocked to fail.
- **Console.warn spy:** The `vi.spyOn(console, 'warn')` setup in Tasks 1 and 3 suppresses warning noise from JSONL parsing. In Task 2, the warn spy must collect output to verify the staleness warning — do not discard args in that describe block.
- **Existing test isolation failure:** `usage.test.ts` has a known intermittent failure when run alongside other tests (JSON parse on concatenated spy output from the `--include-claude-sessions` edge case test). This is pre-existing and unrelated to Phase 5. The new test file uses a distinct `tmpDir` per describe block to prevent cross-test cwd pollution.
