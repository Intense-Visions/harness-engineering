# Plan: Usage & Cost Tracking -- Phase 3: CLI Commands

**Date:** 2026-03-31
**Spec:** docs/changes/usage-cost-tracking/proposal.md
**Estimated tasks:** 7
**Estimated time:** 25 minutes

## Goal

Implement `harness usage daily|sessions|session|latest` subcommands that read costs.jsonl, normalize records, calculate costs, and display table/JSON output.

## Observable Truths (Acceptance Criteria)

1. When `harness usage daily` is run against a sample JSONL file, it displays a per-day table with columns: date, sessions, input tokens, output tokens, model(s), cost. Default 7 days.
2. When `harness usage daily --days 3` is run, only the last 3 days are shown.
3. When `harness usage sessions` is run, it lists recent sessions with timestamp, duration, tokens, model, cost. Default 10.
4. When `harness usage session <id>` is run with a valid ID, it displays full token breakdown (input, output, cache read, cache write), model, cost.
5. When `harness usage session <id>` is run with an invalid ID, it returns an error with a "did you mean?" suggestion.
6. When `harness usage latest` is run, it shows the most recent session's cost summary.
7. When `--json` is passed to any subcommand, the output is valid machine-readable JSON.
8. When `--include-claude-sessions` is passed, the flag is accepted (Phase 4 implements the parser; this phase stubs it).
9. The JSONL reader normalizes snake_case hook output (`session_id`, `token_usage.input_tokens`) to camelCase `UsageRecord` format.
10. When JSONL contains malformed lines, they are skipped with a warning -- the command does not fail.
11. When JSONL contains legacy entries (missing cache/model fields), they display as "unknown" model / "N/A" cost.
12. `npx vitest run tests/commands/usage.test.ts` passes in the `packages/cli` directory.
13. `harness validate` passes.

## File Map

- CREATE `packages/core/src/usage/jsonl-reader.ts` -- JSONL reader with snake_case to camelCase normalization
- CREATE `packages/core/src/usage/jsonl-reader.test.ts` -- Unit tests for JSONL reader
- MODIFY `packages/core/src/usage/index.ts` -- Add export for readCostRecords
- CREATE `packages/cli/src/commands/usage.ts` -- All four subcommands
- CREATE `packages/cli/tests/commands/usage.test.ts` -- Integration tests for CLI commands
- MODIFY `packages/cli/src/index.ts` -- Register usage command

## Tasks

### Task 1: JSONL Reader -- test and implement

**Depends on:** none
**Files:** `packages/core/src/usage/jsonl-reader.ts`, `packages/core/src/usage/jsonl-reader.test.ts`, `packages/core/src/usage/index.ts`

1. Create test file `packages/core/src/usage/jsonl-reader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readCostRecords } from './jsonl-reader';

describe('readCostRecords', () => {
  const tmpDir = path.join(__dirname, '__test-tmp__');
  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');

  beforeEach(() => {
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('normalizes snake_case hook output to camelCase UsageRecord', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-1',
      token_usage: { input_tokens: 100, output_tokens: 50 },
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      sessionId: 'sess-1',
      timestamp: '2026-03-31T10:00:00.000Z',
      tokens: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    });
  });

  it('includes cache tokens when present', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-2',
      token_usage: { input_tokens: 200, output_tokens: 100 },
      cacheCreationTokens: 50,
      cacheReadTokens: 30,
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records[0].cacheCreationTokens).toBe(50);
    expect(records[0].cacheReadTokens).toBe(30);
  });

  it('skips malformed lines with warning', () => {
    const good = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-3',
      token_usage: { input_tokens: 10, output_tokens: 5 },
    });
    fs.writeFileSync(costsFile, 'not json\n' + good + '\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0].sessionId).toBe('sess-3');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping malformed'));
    warnSpy.mockRestore();
  });

  it('handles legacy entries without cache/model fields', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-4',
      token_usage: { input_tokens: 500, output_tokens: 200 },
    });
    fs.writeFileSync(costsFile, line + '\n');

    const records = readCostRecords(tmpDir);
    expect(records[0].model).toBeUndefined();
    expect(records[0].cacheCreationTokens).toBeUndefined();
    expect(records[0].cacheReadTokens).toBeUndefined();
  });

  it('returns empty array when file does not exist', () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const records = readCostRecords(tmpDir);
    expect(records).toEqual([]);
  });

  it('handles entries with null token_usage gracefully', () => {
    const line = JSON.stringify({
      timestamp: '2026-03-31T10:00:00.000Z',
      session_id: 'sess-5',
      token_usage: null,
    });
    fs.writeFileSync(costsFile, line + '\n');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const records = readCostRecords(tmpDir);
    expect(records).toHaveLength(0);
    warnSpy.mockRestore();
  });
});
```

2. Run test: `cd packages/core && npx vitest run src/usage/jsonl-reader.test.ts`
3. Observe failure: module not found.

4. Create implementation `packages/core/src/usage/jsonl-reader.ts`:

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UsageRecord } from '@harness-engineering/types';

/**
 * Reads .harness/metrics/costs.jsonl and normalizes snake_case hook output
 * to camelCase UsageRecord format.
 *
 * - Skips malformed lines with a warning to stderr
 * - Handles legacy entries missing cache/model fields
 * - Returns empty array if file does not exist
 */
export function readCostRecords(projectRoot: string): UsageRecord[] {
  const costsFile = path.join(projectRoot, '.harness', 'metrics', 'costs.jsonl');

  let raw: string;
  try {
    raw = fs.readFileSync(costsFile, 'utf-8');
  } catch {
    return [];
  }

  const records: UsageRecord[] = [];
  const lines = raw.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      console.warn(`[harness usage] Skipping malformed JSONL line ${i + 1}`);
      continue;
    }

    // Validate required fields
    const tokenUsage = entry.token_usage as Record<string, number> | null | undefined;
    if (!tokenUsage || typeof tokenUsage !== 'object') {
      console.warn(`[harness usage] Skipping malformed JSONL line ${i + 1}: missing token_usage`);
      continue;
    }

    const inputTokens = tokenUsage.input_tokens ?? 0;
    const outputTokens = tokenUsage.output_tokens ?? 0;

    const record: UsageRecord = {
      sessionId: (entry.session_id as string) ?? 'unknown',
      timestamp: (entry.timestamp as string) ?? new Date().toISOString(),
      tokens: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
    };

    if (entry.cacheCreationTokens != null) {
      record.cacheCreationTokens = entry.cacheCreationTokens as number;
    }
    if (entry.cacheReadTokens != null) {
      record.cacheReadTokens = entry.cacheReadTokens as number;
    }
    if (entry.model != null) {
      record.model = entry.model as string;
    }

    records.push(record);
  }

  return records;
}
```

5. Update `packages/core/src/usage/index.ts` to add the export:

```typescript
export { aggregateByDay, aggregateBySession } from './aggregator';
export { readCostRecords } from './jsonl-reader';
```

6. Run test: `cd packages/core && npx vitest run src/usage/jsonl-reader.test.ts`
7. Observe: all tests pass
8. Run: `harness validate`
9. Commit: `feat(usage): add JSONL reader with snake_case normalization`

---

### Task 2: Usage command scaffold with `daily` subcommand

**Depends on:** Task 1
**Files:** `packages/cli/src/commands/usage.ts`

1. Create `packages/cli/src/commands/usage.ts`:

```typescript
import { Command } from 'commander';
import { logger } from '../output/logger';

function formatMicroUSD(microUSD: number | null): string {
  if (microUSD == null) return 'N/A';
  return '$' + (microUSD / 1_000_000).toFixed(4);
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return (count / 1_000_000).toFixed(1) + 'M';
  if (count >= 1_000) return (count / 1_000).toFixed(1) + 'K';
  return String(count);
}

function formatModels(models: string[]): string {
  if (models.length === 0) return 'unknown';
  if (models.length === 1) return models[0];
  return `${models[0]} and ${models.length - 1} other${models.length - 1 > 1 ? 's' : ''}`;
}

function registerDailyCommand(usage: Command): void {
  usage
    .command('daily')
    .description('Show per-day token usage and cost')
    .option('--days <n>', 'Number of days to show (default: 7, max: 90)', '7')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const days = Math.min(Math.max(parseInt(opts.days, 10) || 7, 1), 90);
      const cwd = process.cwd();

      const { readCostRecords, aggregateByDay } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      // Calculate costs at read time
      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const dailyData = aggregateByDay(records);
      const limited = dailyData.slice(0, days);

      if (globalOpts.json) {
        console.log(JSON.stringify(limited, null, 2));
        return;
      }

      // Table header
      const header =
        'Date         | Sessions | Input     | Output    | Model(s)                     | Cost';
      const divider =
        '-------------|----------|-----------|-----------|------------------------------|--------';
      logger.info(header);
      logger.info(divider);

      for (const day of limited) {
        const date = day.date.padEnd(12);
        const sessions = String(day.sessionCount).padStart(8);
        const input = formatTokenCount(day.tokens.inputTokens).padStart(9);
        const output = formatTokenCount(day.tokens.outputTokens).padStart(9);
        const models = formatModels(day.models).padEnd(28);
        const cost = formatMicroUSD(day.costMicroUSD);
        logger.info(`${date} | ${sessions} | ${input} | ${output} | ${models} | ${cost}`);
      }
    });
}

function registerSessionsCommand(usage: Command): void {
  usage
    .command('sessions')
    .description('List recent sessions with token usage and cost')
    .option('--limit <n>', 'Number of sessions to show (default: 10, max: 100)', '10')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 10, 1), 100);
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify([]));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      const limited = sessionData.slice(0, limit);

      if (globalOpts.json) {
        console.log(JSON.stringify(limited, null, 2));
        return;
      }

      const header =
        'Session ID           | Started              | Duration  | Tokens    | Model                | Cost';
      const divider =
        '---------------------|----------------------|-----------|-----------|----------------------|--------';
      logger.info(header);
      logger.info(divider);

      for (const s of limited) {
        const id = s.sessionId.slice(0, 20).padEnd(20);
        const started = s.firstTimestamp.slice(0, 19).padEnd(20);
        const durationMs =
          new Date(s.lastTimestamp).getTime() - new Date(s.firstTimestamp).getTime();
        const durationMin = Math.max(1, Math.round(durationMs / 60000));
        const duration = `${durationMin}m`.padStart(9);
        const tokens = formatTokenCount(s.tokens.totalTokens).padStart(9);
        const model = (s.model ?? 'unknown').slice(0, 20).padEnd(20);
        const cost = formatMicroUSD(s.costMicroUSD);
        logger.info(`${id} | ${started} | ${duration} | ${tokens} | ${model} | ${cost}`);
      }
    });
}

function registerSessionCommand(usage: Command): void {
  usage
    .command('session <id>')
    .description('Show detailed token breakdown for a specific session')
    .action(async (id: string, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      const match = sessionData.find((s) => s.sessionId === id);

      if (!match) {
        // Fuzzy match: find sessions containing the given id as substring
        const fuzzy = sessionData.filter(
          (s) => s.sessionId.includes(id) || id.includes(s.sessionId.slice(0, 8))
        );

        const errMsg = `Session "${id}" not found.`;
        if (fuzzy.length > 0) {
          const suggestions = fuzzy.slice(0, 3).map((s) => s.sessionId);
          if (globalOpts.json) {
            console.log(JSON.stringify({ error: errMsg, suggestions }));
          } else {
            logger.error(errMsg);
            logger.info('Did you mean:');
            for (const s of suggestions) {
              logger.info(`  ${s}`);
            }
          }
        } else {
          if (globalOpts.json) {
            console.log(JSON.stringify({ error: errMsg, suggestions: [] }));
          } else {
            logger.error(errMsg);
          }
        }
        process.exitCode = 1;
        return;
      }

      if (globalOpts.json) {
        console.log(JSON.stringify(match, null, 2));
        return;
      }

      logger.info(`Session: ${match.sessionId}`);
      logger.info(`Started: ${match.firstTimestamp}`);
      logger.info(`Ended:   ${match.lastTimestamp}`);
      logger.info(`Model:   ${match.model ?? 'unknown'}`);
      logger.info(`Source:  ${match.source}`);
      logger.info('');
      logger.info('Token Breakdown:');
      logger.info(`  Input tokens:          ${formatTokenCount(match.tokens.inputTokens)}`);
      logger.info(`  Output tokens:         ${formatTokenCount(match.tokens.outputTokens)}`);
      logger.info(`  Total tokens:          ${formatTokenCount(match.tokens.totalTokens)}`);
      if (match.cacheReadTokens != null) {
        logger.info(`  Cache read tokens:     ${formatTokenCount(match.cacheReadTokens)}`);
      }
      if (match.cacheCreationTokens != null) {
        logger.info(`  Cache creation tokens: ${formatTokenCount(match.cacheCreationTokens)}`);
      }
      logger.info('');
      logger.info(`Cost: ${formatMicroUSD(match.costMicroUSD)}`);
    });
}

function registerLatestCommand(usage: Command): void {
  usage
    .command('latest')
    .description('Show the most recently completed session cost summary')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const cwd = process.cwd();

      const { readCostRecords, aggregateBySession } = await import('@harness-engineering/core');
      const { loadPricingData, calculateCost } = await import('@harness-engineering/core');

      const records = readCostRecords(cwd);
      if (records.length === 0) {
        if (globalOpts.json) {
          console.log(JSON.stringify({ error: 'No usage data found' }));
        } else {
          logger.info('No usage data found. Run some harness sessions first.');
        }
        return;
      }

      const pricingData = await loadPricingData(cwd);
      for (const record of records) {
        if (record.model && record.costMicroUSD == null) {
          record.costMicroUSD = calculateCost(record, pricingData);
        }
      }

      const sessionData = aggregateBySession(records);
      // Already sorted descending by firstTimestamp
      const latest = sessionData[0];

      if (globalOpts.json) {
        console.log(JSON.stringify(latest, null, 2));
        return;
      }

      logger.info(`Session: ${latest.sessionId}`);
      logger.info(`Started: ${latest.firstTimestamp}`);
      logger.info(`Ended:   ${latest.lastTimestamp}`);
      logger.info(`Model:   ${latest.model ?? 'unknown'}`);
      logger.info(
        `Tokens:  ${formatTokenCount(latest.tokens.totalTokens)} (${formatTokenCount(latest.tokens.inputTokens)} in / ${formatTokenCount(latest.tokens.outputTokens)} out)`
      );
      logger.info(`Cost:    ${formatMicroUSD(latest.costMicroUSD)}`);
    });
}

export function createUsageCommand(): Command {
  const usage = new Command('usage').description('Token usage and cost tracking');

  // Stub flag for Phase 4 CC parser integration
  usage.option('--include-claude-sessions', 'Include Claude Code session data (requires Phase 4)');

  registerDailyCommand(usage);
  registerSessionsCommand(usage);
  registerSessionCommand(usage);
  registerLatestCommand(usage);

  return usage;
}
```

2. Run: `harness validate`
3. Commit: `feat(usage): add usage command with daily, sessions, session, latest subcommands`

---

### Task 3: Register usage command in CLI index

**Depends on:** Task 2
**Files:** `packages/cli/src/index.ts`

1. Add import to `packages/cli/src/index.ts` after the integrations import:

```typescript
import { createUsageCommand } from './commands/usage';
```

2. Add registration in `createProgram()` after `createIntegrationsCommand()`:

```typescript
program.addCommand(createUsageCommand());
```

3. Run: `harness validate`
4. Commit: `feat(usage): register usage command in CLI`

---

### Task 4: Integration tests -- daily and sessions subcommands

**Depends on:** Task 3
**Files:** `packages/cli/tests/commands/usage.test.ts`

1. Create test file `packages/cli/tests/commands/usage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createUsageCommand } from '../../src/commands/usage';
import { Command } from 'commander';

function makeSampleJSONL(
  entries: Array<{
    timestamp: string;
    session_id: string;
    input_tokens: number;
    output_tokens: number;
    model?: string;
    cacheCreationTokens?: number;
    cacheReadTokens?: number;
  }>
): string {
  return (
    entries
      .map((e) =>
        JSON.stringify({
          timestamp: e.timestamp,
          session_id: e.session_id,
          token_usage: { input_tokens: e.input_tokens, output_tokens: e.output_tokens },
          ...(e.model != null ? { model: e.model } : {}),
          ...(e.cacheCreationTokens != null ? { cacheCreationTokens: e.cacheCreationTokens } : {}),
          ...(e.cacheReadTokens != null ? { cacheReadTokens: e.cacheReadTokens } : {}),
        })
      )
      .join('\n') + '\n'
  );
}

describe('harness usage', () => {
  const tmpDir = path.join(__dirname, '__usage-test-tmp__');
  const costsFile = path.join(tmpDir, '.harness', 'metrics', 'costs.jsonl');
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let logOutput: string[];
  let originalCwd: string;

  const sampleData = makeSampleJSONL([
    {
      timestamp: '2026-03-30T10:00:00.000Z',
      session_id: 'sess-aaa-111',
      input_tokens: 1000,
      output_tokens: 500,
    },
    {
      timestamp: '2026-03-30T14:00:00.000Z',
      session_id: 'sess-aaa-111',
      input_tokens: 2000,
      output_tokens: 800,
    },
    {
      timestamp: '2026-03-31T09:00:00.000Z',
      session_id: 'sess-bbb-222',
      input_tokens: 500,
      output_tokens: 200,
      model: 'claude-sonnet-4-20250514',
    },
    {
      timestamp: '2026-03-29T08:00:00.000Z',
      session_id: 'sess-ccc-333',
      input_tokens: 3000,
      output_tokens: 1500,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
    },
  ]);

  beforeEach(() => {
    originalCwd = process.cwd();
    fs.mkdirSync(path.dirname(costsFile), { recursive: true });
    fs.writeFileSync(costsFile, sampleData);
    process.chdir(tmpDir);
    logOutput = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
      logOutput.push(args.join(' '));
    });
    // Suppress logger info (chalk-decorated) from polluting test output
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(originalCwd);
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createProgram(): Command {
    const program = new Command();
    program.option('--json', 'JSON output');
    program.addCommand(createUsageCommand());
    return program;
  }

  describe('daily', () => {
    it('outputs JSON array when --json is passed', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json'], { from: 'user' });

      const output = JSON.parse(logOutput.join(''));
      expect(Array.isArray(output)).toBe(true);
      expect(output.length).toBeGreaterThanOrEqual(1);
      // Should have date, sessionCount, tokens, models
      expect(output[0]).toHaveProperty('date');
      expect(output[0]).toHaveProperty('sessionCount');
      expect(output[0]).toHaveProperty('tokens');
    });

    it('limits days with --days flag', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--days', '1', '--json'], {
        from: 'user',
      });

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveLength(1);
    });

    it('outputs empty array when no data exists', async () => {
      fs.unlinkSync(costsFile);
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'daily', '--json'], { from: 'user' });

      const output = JSON.parse(logOutput.join(''));
      expect(output).toEqual([]);
    });
  });

  describe('sessions', () => {
    it('outputs JSON array of sessions when --json is passed', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json'], {
        from: 'user',
      });

      const output = JSON.parse(logOutput.join(''));
      expect(Array.isArray(output)).toBe(true);
      // 3 distinct sessions in sample data
      expect(output).toHaveLength(3);
      expect(output[0]).toHaveProperty('sessionId');
      expect(output[0]).toHaveProperty('tokens');
      expect(output[0]).toHaveProperty('firstTimestamp');
    });

    it('limits sessions with --limit flag', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--limit', '2', '--json'], {
        from: 'user',
      });

      const output = JSON.parse(logOutput.join(''));
      expect(output).toHaveLength(2);
    });
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Observe: all tests pass (may need adjustments for loadPricingData network call -- mock if needed).
4. Run: `harness validate`
5. Commit: `test(usage): add integration tests for daily and sessions subcommands`

---

### Task 5: Integration tests -- session detail and latest subcommands

**Depends on:** Task 4
**Files:** `packages/cli/tests/commands/usage.test.ts` (append)

1. Add the following test blocks to `packages/cli/tests/commands/usage.test.ts` inside the outer `describe('harness usage', ...)`:

```typescript
describe('session <id>', () => {
  it('outputs JSON detail for a valid session', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-bbb-222', '--json'], {
      from: 'user',
    });

    const output = JSON.parse(logOutput.join(''));
    expect(output.sessionId).toBe('sess-bbb-222');
    expect(output.tokens.inputTokens).toBe(500);
    expect(output.tokens.outputTokens).toBe(200);
  });

  it('returns error with suggestions for invalid session', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-aaa', '--json'], {
      from: 'user',
    });

    const output = JSON.parse(logOutput.join(''));
    expect(output).toHaveProperty('error');
    expect(output.suggestions).toContain('sess-aaa-111');
  });

  it('returns error with empty suggestions for completely unknown id', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'session', 'nonexistent-xyz', '--json'], {
      from: 'user',
    });

    const output = JSON.parse(logOutput.join(''));
    expect(output.error).toContain('not found');
    expect(output.suggestions).toEqual([]);
  });

  it('includes cache tokens in detail view', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-ccc-333', '--json'], {
      from: 'user',
    });

    const output = JSON.parse(logOutput.join(''));
    expect(output.cacheReadTokens).toBe(100);
    expect(output.cacheCreationTokens).toBe(50);
  });
});

describe('latest', () => {
  it('outputs JSON for the most recent session', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json'], { from: 'user' });

    const output = JSON.parse(logOutput.join(''));
    // Most recent by timestamp should be sess-bbb-222 (2026-03-31)
    expect(output.sessionId).toBe('sess-bbb-222');
  });

  it('returns error when no data exists', async () => {
    fs.unlinkSync(costsFile);
    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'latest', '--json'], { from: 'user' });

    const output = JSON.parse(logOutput.join(''));
    expect(output).toHaveProperty('error');
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(usage): add integration tests for session detail and latest subcommands`

---

### Task 6: Integration tests -- malformed data and edge cases

**Depends on:** Task 5
**Files:** `packages/cli/tests/commands/usage.test.ts` (append)

1. Add the following test block to `packages/cli/tests/commands/usage.test.ts`:

```typescript
describe('edge cases', () => {
  it('handles malformed JSONL lines without crashing', async () => {
    fs.writeFileSync(
      costsFile,
      'bad line\n' +
        makeSampleJSONL([
          {
            timestamp: '2026-03-31T10:00:00.000Z',
            session_id: 'sess-ok',
            input_tokens: 100,
            output_tokens: 50,
          },
        ])
    );

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'sessions', '--json'], { from: 'user' });

    const output = JSON.parse(logOutput.join(''));
    expect(output).toHaveLength(1);
    expect(output[0].sessionId).toBe('sess-ok');
  });

  it('handles legacy entries without model as unknown cost', async () => {
    fs.writeFileSync(
      costsFile,
      makeSampleJSONL([
        {
          timestamp: '2026-03-31T10:00:00.000Z',
          session_id: 'sess-legacy',
          input_tokens: 1000,
          output_tokens: 500,
        },
      ])
    );

    const program = createProgram();
    await program.parseAsync(['node', 'harness', 'usage', 'session', 'sess-legacy', '--json'], {
      from: 'user',
    });

    const output = JSON.parse(logOutput.join(''));
    expect(output.costMicroUSD).toBeNull();
  });

  it('accepts --include-claude-sessions flag without error', async () => {
    const program = createProgram();
    // The flag is accepted but does nothing in Phase 3
    await program.parseAsync(
      ['node', 'harness', 'usage', '--include-claude-sessions', 'daily', '--json'],
      { from: 'user' }
    );

    const output = JSON.parse(logOutput.join(''));
    expect(Array.isArray(output)).toBe(true);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(usage): add edge case tests for malformed data and legacy entries`

---

### Task 7: Build verification and final validation

**Depends on:** Task 6
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run full test suite for the JSONL reader: `cd packages/core && npx vitest run src/usage/jsonl-reader.test.ts`
2. Run full test suite for CLI usage commands: `cd packages/cli && npx vitest run tests/commands/usage.test.ts`
3. Run: `harness validate`
4. Run: `harness check-deps`
5. Verify the command is registered: `cd packages/cli && npx tsx src/index.ts -- usage --help` (or equivalent build-and-run)
6. Verify all observable truths from the acceptance criteria are satisfied by reviewing test output.
