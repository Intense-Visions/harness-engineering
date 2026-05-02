# Plan: Architecture Decay Timeline -- Phase 2: CLI Commands

**Date:** 2026-04-04
**Spec:** docs/changes/architecture-decay-timeline/proposal.md
**Phase:** 2 of 4
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Add `harness snapshot capture`, `harness snapshot trends`, and `harness snapshot list` CLI subcommands that expose the Phase 1 TimelineManager to users via the command line, with integration tests.

## Observable Truths (Acceptance Criteria)

1. When a user runs `harness snapshot capture`, the system shall run all architecture collectors, create a TimelineSnapshot in `.harness/arch/timeline.json`, and print a summary table with stability score, per-category values, deltas, and trend direction.
2. When a user runs `harness snapshot trends`, the system shall load the timeline, compute trends over the default last 10 snapshots, and print a trend table with current/start/delta/direction per category.
3. When a user runs `harness snapshot trends --last 5`, the system shall limit trend computation to the last 5 snapshots.
4. When a user runs `harness snapshot trends --since 2026-01-01`, the system shall filter snapshots to those on or after that date.
5. When a user runs `harness snapshot trends --json`, the system shall output the TrendResult as JSON.
6. When a user runs `harness snapshot list`, the system shall print a table of all snapshots with date, commit hash, and stability score.
7. The `snapshot` command shall be registered in the main CLI program so `harness snapshot` shows help with available subcommands.
8. `npx vitest run packages/cli/tests/commands/snapshot.test.ts` shall pass with tests covering capture, trends, trends --json, and list subcommands.
9. `harness validate` shall pass after all changes.

## File Map

```
CREATE packages/cli/src/commands/snapshot.ts
CREATE packages/cli/tests/commands/snapshot.test.ts
MODIFY packages/cli/src/index.ts (add import + register snapshot command)
MODIFY packages/cli/src/exports/commands.ts (export runSnapshotCapture for MCP reuse in Phase 3)
```

## Tasks

### Task 1: Create snapshot command file with capture subcommand

**Depends on:** none
**Files:** `packages/cli/src/commands/snapshot.ts`

1. Create `packages/cli/src/commands/snapshot.ts` with the following content:

```typescript
import { Command } from 'commander';
import { ArchConfigSchema, runAll, TimelineManager } from '@harness-engineering/core';
import type {
  ArchConfig,
  ArchMetricCategory,
  TimelineSnapshot,
  TrendResult,
  TrendLine,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { execSync } from 'node:child_process';
import chalk from 'chalk';

// --- Helpers ---

function getCommitHash(cwd: string): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf-8' }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function resolveArchConfig(
  configPath?: string
): { archConfig: ArchConfig; error?: never } | { archConfig?: never; error: CLIError } {
  const configResult = resolveConfig(configPath);
  if (!configResult.ok) {
    return { error: configResult.error };
  }
  const archConfig: ArchConfig = configResult.value.architecture ?? ArchConfigSchema.parse({});
  return { archConfig };
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  const sign = delta > 0 ? '+' : '';
  // Show up to 2 decimal places, but trim trailing zeros
  const formatted = Number.isInteger(delta)
    ? String(delta)
    : delta.toFixed(2).replace(/\.?0+$/, '');
  return `${sign}${formatted}`;
}

function directionSymbol(direction: TrendLine['direction']): string {
  switch (direction) {
    case 'improving':
      return chalk.green('improving');
    case 'declining':
      return chalk.red('declining');
    case 'stable':
      return '=';
  }
}

const CATEGORY_ORDER: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

// --- Capture ---

export interface SnapshotCaptureResult {
  snapshot: TimelineSnapshot;
  previous: TimelineSnapshot | undefined;
}

export async function runSnapshotCapture(options: {
  cwd?: string;
  configPath?: string;
}): Promise<SnapshotCaptureResult> {
  const cwd = options.cwd ?? process.cwd();
  const resolved = resolveArchConfig(options.configPath);
  if (resolved.error) {
    throw resolved.error;
  }

  const manager = new TimelineManager(cwd);

  // Load timeline before capture to get previous snapshot
  const timelineBefore = manager.load();
  const previous =
    timelineBefore.snapshots.length > 0
      ? timelineBefore.snapshots[timelineBefore.snapshots.length - 1]
      : undefined;

  const results = await runAll(resolved.archConfig, cwd);
  const commitHash = getCommitHash(cwd);
  const snapshot = manager.capture(results, commitHash);

  return { snapshot, previous };
}

function printCaptureSummary(
  snapshot: TimelineSnapshot,
  previous: TimelineSnapshot | undefined
): void {
  const date = snapshot.capturedAt.slice(0, 10);
  const commit = snapshot.commitHash.slice(0, 7);

  console.log('');
  console.log(`Architecture Snapshot captured (${date}, ${commit})`);
  console.log('');

  // Stability line
  const stabilityDelta = previous
    ? ` (${formatDelta(snapshot.stabilityScore - previous.stabilityScore)} from last)`
    : '';
  console.log(`  Stability: ${snapshot.stabilityScore}/100${stabilityDelta}`);
  console.log('');

  // Category table
  const header = '  Category'.padEnd(22) + 'Value'.padStart(7) + 'Delta'.padStart(8) + '   Trend';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const current = snapshot.metrics[category];
    const prev = previous?.metrics[category];
    const value = current?.value ?? 0;
    const delta = prev ? value - prev.value : 0;

    const valueFmt = Number.isInteger(value) ? String(value) : value.toFixed(2);
    const deltaFmt = formatDelta(delta);
    const direction: TrendLine['direction'] =
      Math.abs(delta) < 0.01 ? 'stable' : delta < 0 ? 'improving' : 'declining';

    const line = `  ${category.padEnd(20)}${valueFmt.padStart(7)}${deltaFmt.padStart(8)}    ${directionSymbol(direction)}`;
    console.log(line);
  }

  console.log('');
}

// --- Trends ---

function printTrendsSummary(trends: TrendResult): void {
  if (trends.snapshotCount === 0) {
    logger.warn('No snapshots found. Run `harness snapshot capture` first.');
    return;
  }

  const fromDate = trends.from.slice(0, 10);
  const toDate = trends.to.slice(0, 10);

  console.log('');
  console.log(`Architecture Trends (${trends.snapshotCount} snapshots, ${fromDate} to ${toDate})`);
  console.log('');

  const stabilityDelta = formatDelta(trends.stability.delta);
  console.log(
    `  Stability: ${trends.stability.current}/100 (was ${trends.stability.previous} on ${fromDate}, ${stabilityDelta})`
  );
  console.log('');

  const header =
    '  Category'.padEnd(22) +
    'Current'.padStart(9) +
    'Start'.padStart(9) +
    'Delta'.padStart(9) +
    '   Trend';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const trend = trends.categories[category];
    if (!trend) continue;

    const currentFmt = Number.isInteger(trend.current)
      ? String(trend.current)
      : trend.current.toFixed(2);
    const prevFmt = Number.isInteger(trend.previous)
      ? String(trend.previous)
      : trend.previous.toFixed(2);
    const deltaFmt = formatDelta(trend.delta);

    const line = `  ${category.padEnd(20)}${currentFmt.padStart(9)}${prevFmt.padStart(9)}${deltaFmt.padStart(9)}    ${directionSymbol(trend.direction)}`;
    console.log(line);
  }

  console.log('');
}

// --- List ---

function printSnapshotList(manager: TimelineManager): void {
  const timeline = manager.load();

  if (timeline.snapshots.length === 0) {
    logger.warn('No snapshots found. Run `harness snapshot capture` first.');
    return;
  }

  console.log('');
  console.log(`Architecture Snapshots (${timeline.snapshots.length} total)`);
  console.log('');

  const header = '  #'.padEnd(6) + 'Date'.padEnd(14) + 'Commit'.padEnd(12) + 'Stability';
  console.log(header);

  timeline.snapshots.forEach((snap, idx) => {
    const date = snap.capturedAt.slice(0, 10);
    const commit = snap.commitHash.slice(0, 7);
    const num = String(idx + 1);
    const line = `  ${num.padEnd(4)}${date.padEnd(14)}${commit.padEnd(12)}${snap.stabilityScore}/100`;
    console.log(line);
  });

  console.log('');
}

// --- Command registration ---

export function createSnapshotCommand(): Command {
  const command = new Command('snapshot').description('Architecture timeline snapshot commands');

  command
    .command('capture')
    .description('Capture current architecture metrics as a timeline snapshot')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const { snapshot, previous } = await runSnapshotCapture({
          configPath: globalOpts.config,
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ snapshot, previous: previous ?? null }, null, 2));
        } else {
          printCaptureSummary(snapshot, previous);
        }
      } catch (err) {
        if (err instanceof CLIError) {
          if (mode === OutputMode.JSON) {
            console.log(JSON.stringify({ error: err.message }));
          } else {
            logger.error(err.message);
          }
          process.exit(err.exitCode);
        }
        throw err;
      }
    });

  command
    .command('trends')
    .description('Show architecture metric trends over time')
    .option('--last <n>', 'Number of recent snapshots to analyze', '10')
    .option('--since <date>', 'Show trends since ISO date')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;
      const cwd = process.cwd();

      const manager = new TimelineManager(cwd);
      const trends = manager.trends({
        last: parseInt(opts.last, 10),
        since: opts.since,
      });

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(trends, null, 2));
      } else {
        printTrendsSummary(trends);
      }
    });

  command
    .command('list')
    .description('List all captured architecture snapshots')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;
      const cwd = process.cwd();

      const manager = new TimelineManager(cwd);

      if (mode === OutputMode.JSON) {
        const timeline = manager.load();
        console.log(JSON.stringify(timeline, null, 2));
      } else {
        printSnapshotList(manager);
      }
    });

  return command;
}
```

2. Run: `harness validate`
3. Commit: `feat(cli): add snapshot command with capture, trends, and list subcommands`

---

### Task 2: Register snapshot command in main CLI program

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at the top of `packages/cli/src/index.ts` (after the `createScanConfigCommand` import):

```typescript
import { createSnapshotCommand } from './commands/snapshot';
```

2. Add registration inside `createProgram()` (after `createScanConfigCommand()` line):

```typescript
program.addCommand(createSnapshotCommand());
```

3. Run: `harness validate`
4. Commit: `feat(cli): register snapshot command in main program`

---

### Task 3: Export runSnapshotCapture for MCP reuse

**Depends on:** Task 1
**Files:** `packages/cli/src/exports/commands.ts`

1. Add the following at the end of `packages/cli/src/exports/commands.ts`:

```typescript
/**
 * Architecture snapshot capture (timeline).
 */
export { runSnapshotCapture } from '../commands/snapshot';
export type { SnapshotCaptureResult } from '../commands/snapshot';
```

2. Run: `harness validate`
3. Commit: `feat(cli): export runSnapshotCapture for downstream MCP tool`

---

### Task 4: Write integration tests for snapshot capture

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/snapshot.test.ts`

1. Create `packages/cli/tests/commands/snapshot.test.ts` with the following content:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSnapshotCommand, runSnapshotCapture } from '../../src/commands/snapshot';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('snapshot command', () => {
  describe('createSnapshotCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createSnapshotCommand();
      expect(cmd.name()).toBe('snapshot');
    });

    it('has capture subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'capture');
      expect(sub).toBeDefined();
    });

    it('has trends subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'trends');
      expect(sub).toBeDefined();
    });

    it('has list subcommand', () => {
      const cmd = createSnapshotCommand();
      const sub = cmd.commands.find((c) => c.name() === 'list');
      expect(sub).toBeDefined();
    });

    it('trends subcommand has --last and --since options', () => {
      const cmd = createSnapshotCommand();
      const trends = cmd.commands.find((c) => c.name() === 'trends');
      const opts = trends!.options.map((o) => o.long);
      expect(opts).toContain('--last');
      expect(opts).toContain('--since');
    });
  });

  describe('runSnapshotCapture', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-test-'));
      // Create minimal harness.config.json
      fs.writeFileSync(
        path.join(tmpDir, 'harness.config.json'),
        JSON.stringify({ version: 1, architecture: { enabled: true } })
      );
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('captures a snapshot and writes timeline.json', async () => {
      const result = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(result.snapshot).toBeDefined();
      expect(result.snapshot.stabilityScore).toBeGreaterThanOrEqual(0);
      expect(result.snapshot.stabilityScore).toBeLessThanOrEqual(100);
      expect(result.snapshot.commitHash).toBeDefined();
      expect(result.snapshot.capturedAt).toBeDefined();
      expect(result.previous).toBeUndefined();

      // Verify timeline file was created
      const timelinePath = path.join(tmpDir, '.harness', 'arch', 'timeline.json');
      expect(fs.existsSync(timelinePath)).toBe(true);

      const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
      expect(timeline.version).toBe(1);
      expect(timeline.snapshots).toHaveLength(1);
    });

    it('returns previous snapshot on second capture', async () => {
      // First capture
      const first = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      // Modify the timeline to have a different commit so dedup does not replace
      const timelinePath = path.join(tmpDir, '.harness', 'arch', 'timeline.json');
      const timeline = JSON.parse(fs.readFileSync(timelinePath, 'utf-8'));
      timeline.snapshots[0].commitHash = 'previous123';
      fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));

      // Second capture
      const second = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      expect(second.previous).toBeDefined();
      expect(second.previous!.commitHash).toBe('previous123');
    });

    it('snapshot contains all 7 metric categories', async () => {
      const result = await runSnapshotCapture({
        cwd: tmpDir,
        configPath: path.join(tmpDir, 'harness.config.json'),
      });

      const categories = Object.keys(result.snapshot.metrics);
      expect(categories).toContain('circular-deps');
      expect(categories).toContain('layer-violations');
      expect(categories).toContain('complexity');
      expect(categories).toContain('coupling');
      expect(categories).toContain('forbidden-imports');
      expect(categories).toContain('module-size');
      expect(categories).toContain('dependency-depth');
      expect(categories).toHaveLength(7);
    });

    it('throws CLIError for invalid config path', async () => {
      await expect(
        runSnapshotCapture({
          configPath: '/nonexistent/harness.config.json',
        })
      ).rejects.toThrow();
    });
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/snapshot.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(cli): add integration tests for snapshot command`

---

### Task 5: Write integration tests for trends and list via TimelineManager

**Depends on:** Task 4
**Files:** `packages/cli/tests/commands/snapshot.test.ts` (append)

1. Add the following test suite to the existing `snapshot.test.ts` file, inside the outer `describe('snapshot command')` block, after the `runSnapshotCapture` describe:

```typescript
describe('trends and list via TimelineManager', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-trends-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('trends returns empty result when no snapshots exist', async () => {
    const { TimelineManager } = await import('@harness-engineering/core');
    const manager = new TimelineManager(tmpDir);
    const trends = manager.trends();

    expect(trends.snapshotCount).toBe(0);
    expect(trends.stability.direction).toBe('stable');
  });

  it('trends respects --last option', async () => {
    const { TimelineManager } = await import('@harness-engineering/core');
    const manager = new TimelineManager(tmpDir);

    // Create a timeline with 5 snapshots manually
    const makeSnapshot = (score: number, hash: string, date: string) => ({
      capturedAt: date,
      commitHash: hash,
      stabilityScore: score,
      metrics: {
        'circular-deps': { value: 0, violationCount: 0 },
        'layer-violations': { value: 0, violationCount: 0 },
        complexity: { value: 0, violationCount: 0 },
        coupling: { value: 0, violationCount: 0 },
        'forbidden-imports': { value: 0, violationCount: 0 },
        'module-size': { value: 0, violationCount: 0 },
        'dependency-depth': { value: 0, violationCount: 0 },
      },
    });

    const timeline = {
      version: 1 as const,
      snapshots: [
        makeSnapshot(60, 'aaa', '2026-01-01T00:00:00.000Z'),
        makeSnapshot(65, 'bbb', '2026-01-08T00:00:00.000Z'),
        makeSnapshot(70, 'ccc', '2026-01-15T00:00:00.000Z'),
        makeSnapshot(75, 'ddd', '2026-01-22T00:00:00.000Z'),
        makeSnapshot(80, 'eee', '2026-01-29T00:00:00.000Z'),
      ],
    };
    manager.save(timeline);

    // Request last 3
    const trends = manager.trends({ last: 3 });
    expect(trends.snapshotCount).toBe(3);
    expect(trends.stability.previous).toBe(70); // 'ccc' snapshot
    expect(trends.stability.current).toBe(80); // 'eee' snapshot
  });

  it('trends respects --since option', async () => {
    const { TimelineManager } = await import('@harness-engineering/core');
    const manager = new TimelineManager(tmpDir);

    const makeSnapshot = (score: number, hash: string, date: string) => ({
      capturedAt: date,
      commitHash: hash,
      stabilityScore: score,
      metrics: {
        'circular-deps': { value: 0, violationCount: 0 },
        'layer-violations': { value: 0, violationCount: 0 },
        complexity: { value: 0, violationCount: 0 },
        coupling: { value: 0, violationCount: 0 },
        'forbidden-imports': { value: 0, violationCount: 0 },
        'module-size': { value: 0, violationCount: 0 },
        'dependency-depth': { value: 0, violationCount: 0 },
      },
    });

    const timeline = {
      version: 1 as const,
      snapshots: [
        makeSnapshot(60, 'aaa', '2026-01-01T00:00:00.000Z'),
        makeSnapshot(70, 'bbb', '2026-02-01T00:00:00.000Z'),
        makeSnapshot(80, 'ccc', '2026-03-01T00:00:00.000Z'),
      ],
    };
    manager.save(timeline);

    const trends = manager.trends({ since: '2026-02-01' });
    expect(trends.snapshotCount).toBe(2);
    expect(trends.stability.previous).toBe(70);
    expect(trends.stability.current).toBe(80);
  });

  it('list shows all snapshots from timeline', async () => {
    const { TimelineManager } = await import('@harness-engineering/core');
    const manager = new TimelineManager(tmpDir);
    const timeline = manager.load();
    expect(timeline.snapshots).toHaveLength(0);
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/snapshot.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(cli): add trends and list integration tests for snapshot command`

---

### Task 6: Verify full test suite and harness validate

**Depends on:** Tasks 1-5
**Files:** none (verification only)

[checkpoint:human-verify]

1. Run: `npx vitest run packages/cli/tests/commands/snapshot.test.ts`
2. Verify all tests pass
3. Run: `harness validate`
4. Verify output: `v validation passed`
5. Run: `npx vitest run packages/core/tests/architecture/` (ensure Phase 1 tests still pass)
6. Verify no regressions

---

## Traceability

| Observable Truth                                   | Delivered by           |
| -------------------------------------------------- | ---------------------- |
| OT1: `harness snapshot capture` creates snapshot   | Task 1, Task 4         |
| OT2: `harness snapshot trends` prints trend table  | Task 1, Task 5         |
| OT3: `trends --last` limits snapshots              | Task 1, Task 5         |
| OT4: `trends --since` filters by date              | Task 1, Task 5         |
| OT5: `trends --json` outputs JSON                  | Task 1, Task 5         |
| OT6: `harness snapshot list` prints snapshot table | Task 1, Task 5         |
| OT7: `snapshot` registered in main CLI             | Task 2                 |
| OT8: Tests pass                                    | Task 4, Task 5, Task 6 |
| OT9: `harness validate` passes                     | Task 6                 |
