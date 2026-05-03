# Plan: CC Parser (Phase 4 — Usage & Cost Tracking)

**Date:** 2026-03-31
**Spec:** docs/changes/usage-cost-tracking/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Claude Code JSONL files at `~/.claude/projects/*/*.jsonl` are parsed into `UsageRecord[]` behind the `--include-claude-sessions` opt-in flag, replacing the current CLI stub warning with working CC data integration.

## Observable Truths (Acceptance Criteria)

1. When `--include-claude-sessions` is passed, CC JSONL files are discovered at `~/.claude/projects/*/*.jsonl` and parsed into `UsageRecord[]` with `_source: 'claude-code'` tags.
2. When CC JSONL entries contain `type: "assistant"` with `message.usage`, they map to valid `UsageRecord` objects with model, input/output tokens, and cache tokens.
3. When multiple assistant entries share the same `requestId` (streaming chunks), only the last entry per requestId is kept to avoid inflating token counts.
4. When CC JSONL entries are malformed, have unexpected structure, or lack `message.usage`, they are skipped silently — no error thrown, no crash.
5. When `~/.claude/projects/` does not exist or contains no JSONL files, `parseCCRecords()` returns an empty array without error.
6. When the CLI `--include-claude-sessions` flag is used, the stub warning ("not yet implemented") is removed and CC records are merged into the aggregated output.
7. `cd packages/core && npx vitest run src/usage/cc-parser.test.ts` passes with 8+ tests.
8. `cd packages/cli && npx vitest run tests/commands/usage.test.ts` passes with all existing + new tests.

## File Map

- CREATE `packages/core/src/usage/cc-parser.ts`
- CREATE `packages/core/src/usage/cc-parser.test.ts`
- MODIFY `packages/core/src/usage/index.ts` (add export for `parseCCRecords`)
- MODIFY `packages/cli/src/commands/usage.ts` (wire CC parser into `loadAndPriceRecords`, remove stub warning)
- MODIFY `packages/cli/tests/commands/usage.test.ts` (add integration tests for `--include-claude-sessions`)

## Tasks

### Task 1: Create cc-parser with tests (TDD — discovery and parsing)

**Depends on:** none
**Files:** `packages/core/src/usage/cc-parser.test.ts`, `packages/core/src/usage/cc-parser.ts`

1. Create test file `packages/core/src/usage/cc-parser.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseCCRecords } from './cc-parser';

function makeCCLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    sessionId: 'cc-sess-001',
    requestId: 'req-default-001',
    timestamp: '2026-03-31T10:00:00.000Z',
    message: {
      model: 'claude-sonnet-4-20250514',
      role: 'assistant',
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 500,
        cache_read_input_tokens: 300,
      },
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hello' }],
    },
    ...overrides,
  });
}

describe('parseCCRecords', () => {
  const tmpHome = path.join(__dirname, '__cc-test-home__');
  const projectDir = path.join(tmpHome, '.claude', 'projects', '-test-project');
  let originalHome: string | undefined;

  beforeEach(() => {
    originalHome = process.env.HOME;
    process.env.HOME = tmpHome;
    fs.mkdirSync(projectDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it('parses assistant entries with usage into UsageRecords', () => {
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), makeCCLine() + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sessionId: 'cc-sess-001',
      model: 'claude-sonnet-4-20250514',
      tokens: { inputTokens: 1000, outputTokens: 200, totalTokens: 1200 },
      cacheCreationTokens: 500,
      cacheReadTokens: 300,
    });
    expect((records[0] as any)._source).toBe('claude-code');
  });

  it('skips non-assistant entries', () => {
    const lines =
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'hi' },
          sessionId: 's1',
          timestamp: '2026-03-31T10:00:00Z',
        }),
        makeCCLine(),
      ].join('\n') + '\n';
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), lines);

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
  });

  it('skips entries without message.usage', () => {
    const noUsage = JSON.stringify({
      type: 'assistant',
      sessionId: 's1',
      timestamp: '2026-03-31T10:00:00Z',
      message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
    });
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), noUsage + '\n' + makeCCLine() + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
  });

  it('skips malformed JSON lines without throwing', () => {
    const content = 'not valid json\n' + makeCCLine() + '\n';
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), content);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
    warnSpy.mockRestore();
  });

  it('returns empty array when .claude/projects does not exist', () => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.mkdirSync(tmpHome, { recursive: true });
    // Do not create .claude directory

    const records = parseCCRecords();
    expect(records).toEqual([]);
  });

  it('reads from multiple project directories and JSONL files', () => {
    const projectDir2 = path.join(tmpHome, '.claude', 'projects', '-other-project');
    fs.mkdirSync(projectDir2, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'a.jsonl'), makeCCLine({ sessionId: 'sess-a' }) + '\n');
    fs.writeFileSync(path.join(projectDir2, 'b.jsonl'), makeCCLine({ sessionId: 'sess-b' }) + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(2);
    const ids = records.map((r) => r.sessionId).sort();
    expect(ids).toEqual(['sess-a', 'sess-b']);
  });

  it('deduplicates streaming chunks by requestId, keeping last entry', () => {
    // CC emits multiple assistant entries per API request (streaming chunks).
    // Each chunk carries the same requestId. The last chunk has the final output_tokens count.
    const chunk1 = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-dup-001',
      timestamp: '2026-03-31T10:00:00.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 36,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
        stop_reason: null,
        content: [{ type: 'text', text: 'partial' }],
      },
    });
    const chunk2 = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-dup-001',
      timestamp: '2026-03-31T10:00:01.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: {
          input_tokens: 3,
          output_tokens: 292,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 0,
        },
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'complete response' }],
      },
    });
    const differentReq = JSON.stringify({
      type: 'assistant',
      sessionId: 'cc-sess-001',
      requestId: 'req-other-002',
      timestamp: '2026-03-31T10:01:00.000Z',
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'other' }],
      },
    });

    fs.writeFileSync(
      path.join(projectDir, 'session1.jsonl'),
      [chunk1, chunk2, differentReq].join('\n') + '\n'
    );

    const records = parseCCRecords();
    // Should have 2 records: one for req-dup-001 (last chunk) and one for req-other-002
    expect(records).toHaveLength(2);
    // The deduped record should have the final output_tokens (292, not 36)
    const dupRecord = records.find((r) => r.tokens.outputTokens === 292);
    expect(dupRecord).toBeDefined();
    expect(dupRecord!.tokens.inputTokens).toBe(3);
  });

  it('handles entries with zero or missing cache tokens', () => {
    const line = makeCCLine({
      message: {
        model: 'claude-sonnet-4-20250514',
        role: 'assistant',
        usage: { input_tokens: 50, output_tokens: 10 },
        stop_reason: 'end_turn',
        content: [],
      },
    });
    fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), line + '\n');

    const records = parseCCRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.cacheCreationTokens).toBeUndefined();
    expect(records[0]!.cacheReadTokens).toBeUndefined();
  });
});
```

2. Run test: `cd packages/core && npx vitest run src/usage/cc-parser.test.ts`
3. Observe failure: `parseCCRecords` is not defined / module not found

4. Create implementation `packages/core/src/usage/cc-parser.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { UsageRecord } from '@harness-engineering/types';

/**
 * Internal tagged record type matching the aggregator's merge convention.
 */
type TaggedRecord = UsageRecord & { _source: 'claude-code' };

/**
 * Intermediate parsed entry before deduplication.
 * Carries requestId for dedup of streaming chunks.
 */
interface ParsedCCEntry {
  record: TaggedRecord;
  requestId: string | null;
}

/**
 * Parses a single CC JSONL line into a ParsedCCEntry if it is an assistant
 * message with usage data. Returns null for all other entry types.
 */
function parseCCLine(line: string, filePath: string, lineNumber: number): ParsedCCEntry | null {
  let entry: Record<string, unknown>;
  try {
    entry = JSON.parse(line);
  } catch {
    console.warn(
      `[harness usage] Skipping malformed CC JSONL line ${lineNumber} in ${path.basename(filePath)}`
    );
    return null;
  }

  if (entry.type !== 'assistant') return null;

  const message = entry.message as Record<string, unknown> | null | undefined;
  if (!message || typeof message !== 'object') return null;

  const usage = message.usage as Record<string, number> | null | undefined;
  if (!usage || typeof usage !== 'object') return null;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;

  const record: TaggedRecord = {
    sessionId: (entry.sessionId as string) ?? 'unknown',
    timestamp: (entry.timestamp as string) ?? new Date().toISOString(),
    tokens: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    },
    _source: 'claude-code',
  };

  const model = message.model as string | undefined;
  if (model) record.model = model;

  if (usage.cache_creation_input_tokens != null && usage.cache_creation_input_tokens > 0) {
    record.cacheCreationTokens = usage.cache_creation_input_tokens;
  }
  if (usage.cache_read_input_tokens != null && usage.cache_read_input_tokens > 0) {
    record.cacheReadTokens = usage.cache_read_input_tokens;
  }

  return {
    record,
    requestId: (entry.requestId as string) ?? null,
  };
}

/**
 * Reads a single CC JSONL file and extracts UsageRecords from assistant entries.
 *
 * Deduplicates streaming chunks: CC emits multiple assistant entries per API
 * request (same requestId). Each chunk carries cumulative-ish usage, but the
 * last chunk for a given requestId has the authoritative output_tokens count.
 * We keep only the last entry per requestId.
 */
function readCCFile(filePath: string): TaggedRecord[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  // Map from requestId -> last parsed entry (for dedup)
  const byRequestId = new Map<string, TaggedRecord>();
  // Entries without a requestId (no dedup needed)
  const noRequestId: TaggedRecord[] = [];

  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parsed = parseCCLine(line, filePath, i + 1);
    if (!parsed) continue;

    if (parsed.requestId) {
      // Last entry wins — overwrites previous chunks with same requestId
      byRequestId.set(parsed.requestId, parsed.record);
    } else {
      noRequestId.push(parsed.record);
    }
  }

  return [...byRequestId.values(), ...noRequestId];
}

/**
 * Discovers and parses Claude Code JSONL files from ~/.claude/projects/ directories.
 *
 * Best-effort: the path is not a public API and may change across CC versions.
 * - If ~/.claude/projects/ does not exist, returns empty array (no error)
 * - Malformed entries are skipped with a console.warn
 * - Each valid assistant entry with usage data maps to a UsageRecord tagged with _source: 'claude-code'
 */
export function parseCCRecords(): UsageRecord[] {
  const homeDir = process.env.HOME ?? os.homedir();
  const projectsDir = path.join(homeDir, '.claude', 'projects');

  let projectDirs: string[];
  try {
    projectDirs = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(projectsDir, d.name));
  } catch {
    return [];
  }

  const records: TaggedRecord[] = [];

  for (const dir of projectDirs) {
    let files: string[];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.jsonl'))
        .map((f) => path.join(dir, f));
    } catch {
      continue;
    }

    for (const file of files) {
      records.push(...readCCFile(file));
    }
  }

  return records;
}
```

5. Run test: `cd packages/core && npx vitest run src/usage/cc-parser.test.ts`
6. Observe: all 8 tests pass
7. Run: `harness validate`
8. Commit: `feat(usage): add Claude Code JSONL parser with tests`

---

### Task 2: Export parseCCRecords from core usage index

**Depends on:** Task 1
**Files:** `packages/core/src/usage/index.ts`

1. Modify `packages/core/src/usage/index.ts` to add the export:

```typescript
export { aggregateByDay, aggregateBySession } from './aggregator';
export { readCostRecords } from './jsonl-reader';
export { parseCCRecords } from './cc-parser';
```

2. Run: `cd packages/core && npx vitest run src/usage/cc-parser.test.ts`
3. Observe: all tests still pass
4. Run: `harness validate`
5. Commit: `feat(usage): export parseCCRecords from core usage module`

---

### Task 3: Wire CC parser into CLI usage commands

**Depends on:** Task 2
**Files:** `packages/cli/src/commands/usage.ts`

1. Modify `packages/cli/src/commands/usage.ts`:

   a. Update `loadAndPriceRecords` to accept an `includeClaudeSessions` parameter and merge CC records:

   ```typescript
   async function loadAndPriceRecords(
     cwd: string,
     includeClaudeSessions = false
   ): Promise<UsageRecord[]> {
     const { readCostRecords, loadPricingData, calculateCost } =
       await import('@harness-engineering/core');

     const records = readCostRecords(cwd);

     if (includeClaudeSessions) {
       const { parseCCRecords } = await import('@harness-engineering/core');
       const ccRecords = parseCCRecords();
       records.push(...ccRecords);
     }

     if (records.length === 0) return records;

     const pricingData = await loadPricingData(cwd);
     for (const record of records) {
       if (record.model && record.costMicroUSD == null) {
         const cost = calculateCost(record, pricingData);
         if (cost != null) record.costMicroUSD = cost;
       }
     }
     return records;
   }
   ```

   b. Remove the stub `preAction` hook that emits the "not yet implemented" warning.

   c. In each command action, pass the `includeClaudeSessions` flag through. Update each action's call from `loadAndPriceRecords(cwd)` to `loadAndPriceRecords(cwd, globalOpts.includeClaudeSessions)`. The `globalOpts` is already available — `registerDailyCommand` uses `cmd.optsWithGlobals()` which includes parent command options.

   Specific changes in each register function's action:
   - `registerDailyCommand`: change `await loadAndPriceRecords(cwd)` to `await loadAndPriceRecords(cwd, globalOpts.includeClaudeSessions)`
   - `registerSessionsCommand`: same change
   - `registerSessionCommand`: same change
   - `registerLatestCommand`: same change

   d. Update the `--include-claude-sessions` option description from `'Include Claude Code session data (not yet implemented)'` to `'Include Claude Code session data from ~/.claude/projects/'`.

2. Run: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Observe: all 14 existing tests pass (the stub test now works without the warning)
4. Run: `harness validate`
5. Commit: `feat(usage): wire CC parser into CLI --include-claude-sessions flag`

---

### Task 4: Add CLI integration tests for --include-claude-sessions

**Depends on:** Task 3
**Files:** `packages/cli/tests/commands/usage.test.ts`

1. Add a new `describe('--include-claude-sessions')` block to `packages/cli/tests/commands/usage.test.ts`. This block should:

   a. Create a fake `~/.claude/projects/-test/` directory in a temp location and set `process.env.HOME` to the temp root before each test. Restore in `afterEach`.

   b. Write CC JSONL data into that fake directory with known assistant entries.

   Add these tests inside the new describe block:

   ```typescript
   describe('--include-claude-sessions', () => {
     const ccHome = path.join(tmpDir, '__cc-home__');
     const ccProjectDir = path.join(ccHome, '.claude', 'projects', '-test-project');
     let savedHome: string | undefined;

     function makeCCAssistantLine(opts: {
       sessionId: string;
       model: string;
       inputTokens: number;
       outputTokens: number;
       timestamp: string;
     }): string {
       return JSON.stringify({
         type: 'assistant',
         sessionId: opts.sessionId,
         timestamp: opts.timestamp,
         message: {
           model: opts.model,
           role: 'assistant',
           usage: {
             input_tokens: opts.inputTokens,
             output_tokens: opts.outputTokens,
           },
           stop_reason: 'end_turn',
           content: [{ type: 'text', text: 'response' }],
         },
       });
     }

     beforeEach(() => {
       savedHome = process.env.HOME;
       process.env.HOME = ccHome;
       fs.mkdirSync(ccProjectDir, { recursive: true });
       fs.writeFileSync(
         path.join(ccProjectDir, 'cc-session.jsonl'),
         makeCCAssistantLine({
           sessionId: 'cc-only-sess',
           model: 'claude-opus-4-20250514',
           inputTokens: 5000,
           outputTokens: 2000,
           timestamp: '2026-03-31T12:00:00.000Z',
         }) + '\n'
       );
     });

     afterEach(() => {
       process.env.HOME = savedHome;
     });

     it('merges CC records into sessions output', async () => {
       const program = createProgram();
       await program.parseAsync([
         'node',
         'harness',
         'usage',
         '--include-claude-sessions',
         'sessions',
         '--json',
       ]);

       const output = JSON.parse(logOutput.join(''));
       expect(Array.isArray(output)).toBe(true);
       // Should include both harness sessions (3) and CC session (1)
       const ccSession = output.find((s: any) => s.sessionId === 'cc-only-sess');
       expect(ccSession).toBeDefined();
       expect(ccSession.source).toBe('claude-code');
       expect(ccSession.model).toBe('claude-opus-4-20250514');
     });

     it('merges CC data into daily output', async () => {
       const program = createProgram();
       await program.parseAsync([
         'node',
         'harness',
         'usage',
         '--include-claude-sessions',
         'daily',
         '--json',
       ]);

       const output = JSON.parse(logOutput.join(''));
       // 2026-03-31 should now have 2 sessions (harness sess-bbb-222 + CC cc-only-sess)
       const march31 = output.find((d: any) => d.date === '2026-03-31');
       expect(march31).toBeDefined();
       expect(march31.sessionCount).toBe(2);
     });

     it('does not include CC data when flag is not passed', async () => {
       const program = createProgram();
       await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json']);

       const output = JSON.parse(logOutput.join(''));
       const ccSession = output.find((s: any) => s.sessionId === 'cc-only-sess');
       expect(ccSession).toBeUndefined();
     });
   });
   ```

2. Run: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Observe: all existing + 3 new tests pass (17 total)
4. Run: `harness validate`
5. Commit: `test(usage): add integration tests for --include-claude-sessions with CC data`

---

### Task 5: Graceful degradation tests

**Depends on:** Task 1
**Files:** `packages/core/src/usage/cc-parser.test.ts`

1. Add additional tests to `packages/core/src/usage/cc-parser.test.ts` for edge cases:

   ```typescript
   it('handles empty JSONL files gracefully', () => {
     fs.writeFileSync(path.join(projectDir, 'empty.jsonl'), '');

     const records = parseCCRecords();
     expect(records).toEqual([]);
   });

   it('handles JSONL with only non-assistant entries', () => {
     const lines =
       [
         JSON.stringify({
           type: 'user',
           sessionId: 's1',
           timestamp: '2026-03-31T10:00:00Z',
           message: { role: 'user', content: 'hi' },
         }),
         JSON.stringify({
           type: 'system',
           sessionId: 's1',
           timestamp: '2026-03-31T10:01:00Z',
           content: 'system msg',
         }),
         JSON.stringify({
           type: 'progress',
           sessionId: 's1',
           timestamp: '2026-03-31T10:02:00Z',
           data: {},
         }),
       ].join('\n') + '\n';
     fs.writeFileSync(path.join(projectDir, 'session1.jsonl'), lines);

     const records = parseCCRecords();
     expect(records).toEqual([]);
   });

   it('handles file read permission errors gracefully', () => {
     fs.writeFileSync(path.join(projectDir, 'locked.jsonl'), makeCCLine() + '\n');
     fs.chmodSync(path.join(projectDir, 'locked.jsonl'), 0o000);

     const records = parseCCRecords();
     // Should not throw, just skip the unreadable file
     expect(Array.isArray(records)).toBe(true);

     // Restore permissions for cleanup
     fs.chmodSync(path.join(projectDir, 'locked.jsonl'), 0o644);
   });
   ```

2. Run: `cd packages/core && npx vitest run src/usage/cc-parser.test.ts`
3. Observe: all 11 tests pass
4. Run: `harness validate`
5. Commit: `test(usage): add graceful degradation tests for CC parser`
