# Plan: Predictive Architecture Failure -- Phase 4: CLI & MCP Surfaces

**Date:** 2026-04-04
**Spec:** docs/changes/predictive-architecture-failure/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Expose the PredictionEngine through a `harness predict` CLI command with human-readable table output and `--json` flag, and a `predict_failures` MCP tool returning PredictionResult JSON.

## Observable Truths (Acceptance Criteria)

1. When `harness predict` is invoked with `--json`, the system shall return valid PredictionResult JSON matching the PredictionResultSchema.
2. When `harness predict` is invoked without `--json`, the system shall render a human-readable table with columns: Category, Current, Threshold, 4w, 8w, 12w, Crossing, Confidence, plus a Stability line at the top and Warnings section at the bottom.
3. When `harness predict --category complexity` is invoked, the system shall filter output to the `complexity` category only.
4. When `harness predict --no-roadmap` is invoked, the system shall pass `includeRoadmap: false` to PredictionEngine.
5. When `harness predict --horizon 24` is invoked, the system shall pass `horizon: 24` to PredictionEngine.
6. When PredictionEngine throws (fewer than 3 snapshots), `harness predict` shall display an informative error and exit with non-zero code.
7. The `predict_failures` MCP tool shall accept `{ path, horizon?, category?, includeRoadmap? }` and return PredictionResult JSON wrapped in MCP content format.
8. The `predict_failures` MCP tool shall return `isError: true` with an error message when the path is filesystem root.
9. The `predict_failures` MCP tool shall return `isError: true` with an informative message when fewer than 3 snapshots exist.
10. `npx vitest run packages/cli/tests/commands/predict.test.ts` passes.
11. `npx vitest run packages/cli/tests/mcp/tools/predict-failures.test.ts` passes.
12. `harness validate` passes.

## File Map

- CREATE `packages/cli/src/commands/predict.ts`
- CREATE `packages/cli/tests/commands/predict.test.ts`
- CREATE `packages/cli/src/mcp/tools/predict-failures.ts`
- CREATE `packages/cli/tests/mcp/tools/predict-failures.test.ts`
- MODIFY `packages/cli/src/index.ts` (add import + `program.addCommand(createPredictCommand())`)
- MODIFY `packages/cli/src/mcp/server.ts` (add import + definition + handler for predict_failures)

## Tasks

### Task 1: Create predict CLI command with human-readable output and --json

**Depends on:** none (PredictionEngine, TimelineManager, SpecImpactEstimator already exist in core)
**Files:** `packages/cli/src/commands/predict.ts`

1. Create `packages/cli/src/commands/predict.ts` with the following implementation:

```typescript
import { Command } from 'commander';
import {
  TimelineManager,
  PredictionEngine,
  SpecImpactEstimator,
  ArchConfigSchema,
} from '@harness-engineering/core';
import type {
  ArchMetricCategory,
  PredictionResult,
  AdjustedForecast,
  PredictionWarning,
  ArchConfig,
} from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import chalk from 'chalk';

const CATEGORY_ORDER: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function crossingLabel(weeks: number | null): string {
  if (weeks === null || weeks <= 0) return '--';
  return `~${Math.round(weeks)} weeks`;
}

function severityPrefix(severity: PredictionWarning['severity']): string {
  switch (severity) {
    case 'critical':
      return chalk.red('[critical]');
    case 'warning':
      return chalk.yellow('[warning]');
    case 'info':
      return chalk.blue('[info]');
  }
}

function printPredictionReport(result: PredictionResult): void {
  const sf = result.stabilityForecast;
  const horizonWeeks = 12; // default display horizon

  console.log('');
  console.log(
    `Architecture Prediction (${horizonWeeks}-week horizon, ${result.snapshotsUsed} snapshots)`
  );
  console.log('');
  console.log(
    `  Stability: ${sf.current}/100 -> projected ${sf.projected12w}/100 in 12w (${sf.confidence} confidence)`
  );
  console.log('');

  // Table header
  const header =
    '  ' +
    'Category'.padEnd(20) +
    'Current'.padStart(9) +
    'Threshold'.padStart(11) +
    '4w'.padStart(7) +
    '8w'.padStart(7) +
    '12w'.padStart(7) +
    '   Crossing'.padEnd(16) +
    'Confidence';
  console.log(header);

  for (const category of CATEGORY_ORDER) {
    const af: AdjustedForecast | undefined = result.categories[category];
    if (!af) continue;
    const f = af.adjusted;

    const line =
      '  ' +
      category.padEnd(20) +
      formatValue(f.current).padStart(9) +
      formatValue(f.threshold).padStart(11) +
      formatValue(f.projectedValue4w).padStart(7) +
      formatValue(f.projectedValue8w).padStart(7) +
      formatValue(f.projectedValue12w).padStart(7) +
      ('   ' + crossingLabel(f.thresholdCrossingWeeks)).padEnd(16) +
      f.confidence;
    console.log(line);
  }

  // Warnings
  if (result.warnings.length > 0) {
    console.log('');
    console.log('  Warnings:');
    for (const w of result.warnings) {
      console.log(`  ${severityPrefix(w.severity)} ${w.message}`);
      if (w.contributingFeatures.length > 0) {
        console.log(`    Accelerated by: ${w.contributingFeatures.join(', ')}`);
      }
    }
  }

  console.log('');
}

export function runPredict(options: {
  cwd?: string;
  configPath?: string;
  category?: string;
  noRoadmap?: boolean;
  horizon?: number;
}): PredictionResult {
  const cwd = options.cwd ?? process.cwd();

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    throw configResult.error;
  }

  const archConfig: ArchConfig = configResult.value.architecture ?? ArchConfigSchema.parse({});

  const manager = new TimelineManager(cwd);
  const estimator =
    options.noRoadmap === true
      ? null
      : new SpecImpactEstimator(cwd, archConfig.prediction?.coefficients);
  const engine = new PredictionEngine(cwd, manager, estimator);

  const categories = options.category ? [options.category as ArchMetricCategory] : undefined;

  return engine.predict({
    horizon: options.horizon,
    includeRoadmap: options.noRoadmap !== true,
    categories,
  });
}

export function createPredictCommand(): Command {
  const command = new Command('predict')
    .description('Predict which architectural constraints will break and when')
    .option('--category <name>', 'Filter to a single metric category')
    .option('--no-roadmap', 'Baseline only — skip roadmap spec impact')
    .option('--horizon <weeks>', 'Forecast horizon in weeks (default: 12)', '12')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const result = runPredict({
          configPath: globalOpts.config,
          category: opts.category,
          noRoadmap: opts.roadmap === false,
          horizon: parseInt(opts.horizon, 10),
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printPredictionReport(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (err instanceof CLIError) {
          if (mode === OutputMode.JSON) {
            console.log(JSON.stringify({ error: message }));
          } else {
            logger.error(message);
          }
          process.exit(err.exitCode);
        }
        // PredictionEngine throws plain Error for < 3 snapshots
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(message);
        }
        process.exit(ExitCode.ERROR);
      }
    });

  return command;
}
```

2. Run: `harness validate`
3. Commit: `feat(cli): add harness predict command with table output and --json flag`

---

### Task 2: Write CLI command unit tests

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/predict.test.ts`

1. Create `packages/cli/tests/commands/predict.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createPredictCommand } from '../../src/commands/predict';

describe('predict command', () => {
  describe('createPredictCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createPredictCommand();
      expect(cmd.name()).toBe('predict');
    });

    it('has --category option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--category');
    });

    it('has --no-roadmap option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--no-roadmap');
    });

    it('has --horizon option', () => {
      const cmd = createPredictCommand();
      const opts = cmd.options.map((o) => o.long);
      expect(opts).toContain('--horizon');
    });

    it('has description', () => {
      const cmd = createPredictCommand();
      expect(cmd.description()).toContain('predict');
    });
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/predict.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(cli): add predict command unit tests`

---

### Task 3: Register predict command in CLI index

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at the end of the import block (after `import { createSnapshotCommand } from './commands/snapshot';`):

```typescript
import { createPredictCommand } from './commands/predict';
```

2. Add registration at the end of the `addCommand` block (after `program.addCommand(createSnapshotCommand());`):

```typescript
program.addCommand(createPredictCommand());
```

3. Run: `harness validate`
4. Commit: `feat(cli): register predict command in CLI entry point`

---

### Task 4: Create predict_failures MCP tool

**Depends on:** none (PredictionEngine already exists in core)
**Files:** `packages/cli/src/mcp/tools/predict-failures.ts`

1. Create `packages/cli/src/mcp/tools/predict-failures.ts`:

```typescript
import { sanitizePath } from '../utils/sanitize-path.js';

export const predictFailuresDefinition = {
  name: 'predict_failures',
  description:
    'Predict which architectural constraints will break and when, based on decay trends and planned roadmap features. Requires at least 3 timeline snapshots.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      horizon: {
        type: 'number',
        description: 'Forecast horizon in weeks (default: 12)',
      },
      category: {
        type: 'string',
        description: 'Filter to a single metric category',
        enum: [
          'circular-deps',
          'layer-violations',
          'complexity',
          'coupling',
          'forbidden-imports',
          'module-size',
          'dependency-depth',
        ],
      },
      includeRoadmap: {
        type: 'boolean',
        description: 'Include roadmap spec impact in forecasts (default: true)',
      },
    },
    required: ['path'],
  },
};

export async function handlePredictFailures(input: {
  path: string;
  horizon?: number;
  category?: string;
  includeRoadmap?: boolean;
}) {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }

  try {
    const core = await import('@harness-engineering/core');
    const { TimelineManager, PredictionEngine, SpecImpactEstimator } = core;

    const manager = new TimelineManager(projectPath);
    const includeRoadmap = input.includeRoadmap !== false;
    const estimator = includeRoadmap ? new SpecImpactEstimator(projectPath) : null;
    const engine = new PredictionEngine(projectPath, manager, estimator);

    const categories = input.category ? [input.category as core.ArchMetricCategory] : undefined;

    const result = engine.predict({
      horizon: input.horizon,
      includeRoadmap,
      categories,
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
```

2. Run: `harness validate`
3. Commit: `feat(mcp): add predict_failures MCP tool`

---

### Task 5: Register predict_failures in MCP server

**Depends on:** Task 4
**Files:** `packages/cli/src/mcp/server.ts`

1. Add import after the `getDecayTrendsDefinition` import line (around line 121):

```typescript
import { predictFailuresDefinition, handlePredictFailures } from './tools/predict-failures.js';
```

2. Add `predictFailuresDefinition` to the `TOOL_DEFINITIONS` array (before the `].map(...)` closing, after `checkTraceabilityDefinition`):

```typescript
  predictFailuresDefinition,
```

3. Add handler to `TOOL_HANDLERS` object (after `check_traceability: handleCheckTraceability as ToolHandler,`):

```typescript
  predict_failures: handlePredictFailures as ToolHandler,
```

4. Run: `harness validate`
5. Commit: `feat(mcp): register predict_failures tool in MCP server`

---

### Task 6: Write MCP tool unit tests

**Depends on:** Task 4
**Files:** `packages/cli/tests/mcp/tools/predict-failures.test.ts`

1. Create `packages/cli/tests/mcp/tools/predict-failures.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import {
  predictFailuresDefinition,
  handlePredictFailures,
} from '../../../src/mcp/tools/predict-failures.js';

function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

// Helper to create timeline.json with N snapshots
function createTimeline(dir: string, count: number) {
  const archDir = path.join(dir, '.harness', 'arch');
  fs.mkdirSync(archDir, { recursive: true });

  const snapshots = [];
  const now = Date.now();
  for (let i = 0; i < count; i++) {
    const date = new Date(now - (count - i) * 7 * 24 * 60 * 60 * 1000);
    snapshots.push({
      capturedAt: date.toISOString(),
      commitHash: `abc${i}def`,
      stabilityScore: 80 + i,
      metrics: {
        'circular-deps': { value: i, violationCount: 0 },
        'layer-violations': { value: i + 1, violationCount: 0 },
        complexity: { value: 40 + i * 3, violationCount: 0 },
        coupling: { value: 0.3 + i * 0.05, violationCount: 0 },
        'forbidden-imports': { value: 0, violationCount: 0 },
        'module-size': { value: 1 + i, violationCount: 0 },
        'dependency-depth': { value: 3 + i, violationCount: 0 },
      },
    });
  }

  fs.writeFileSync(
    path.join(archDir, 'timeline.json'),
    JSON.stringify({ version: 1, snapshots }, null, 2)
  );
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'predict-failures-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('predict_failures definition', () => {
  it('has correct name', () => {
    expect(predictFailuresDefinition.name).toBe('predict_failures');
  });

  it('requires path parameter', () => {
    expect(predictFailuresDefinition.inputSchema.required).toEqual(['path']);
  });

  it('has optional horizon, category, and includeRoadmap parameters', () => {
    const props = predictFailuresDefinition.inputSchema.properties;
    expect(props).toHaveProperty('horizon');
    expect(props).toHaveProperty('category');
    expect(props).toHaveProperty('includeRoadmap');
  });

  it('category has enum with all 7 metric categories', () => {
    const categoryProp = predictFailuresDefinition.inputSchema.properties.category;
    expect(categoryProp.enum).toHaveLength(7);
    expect(categoryProp.enum).toContain('complexity');
    expect(categoryProp.enum).toContain('coupling');
  });
});

describe('handlePredictFailures', () => {
  it('returns error for filesystem root path', async () => {
    const result = await handlePredictFailures({ path: '/' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('filesystem root');
  });

  it('returns error when fewer than 3 snapshots exist', async () => {
    createTimeline(tmpDir, 2);
    const result = await handlePredictFailures({ path: tmpDir });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('at least 3 snapshots');
  });

  it('returns error when no timeline exists', async () => {
    const result = await handlePredictFailures({ path: tmpDir });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('at least 3 snapshots');
  });

  it('returns PredictionResult JSON with 3+ snapshots', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({ path: tmpDir });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('snapshotsUsed');
    expect(data).toHaveProperty('timelineRange');
    expect(data).toHaveProperty('stabilityForecast');
    expect(data).toHaveProperty('categories');
    expect(data).toHaveProperty('warnings');
    expect(data.snapshotsUsed).toBe(5);
  });

  it('respects category filter', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      category: 'complexity',
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.categories).toHaveProperty('complexity');
    // Other categories should still be present but with zero forecasts
    expect(data.categories).toHaveProperty('coupling');
  });

  it('respects includeRoadmap: false', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      includeRoadmap: false,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    // Should still produce predictions, just without roadmap adjustment
    expect(data.snapshotsUsed).toBe(5);
  });

  it('respects custom horizon', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({
      path: tmpDir,
      horizon: 24,
    });

    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.snapshotsUsed).toBe(5);
  });

  it('returns all 7 categories in result', async () => {
    createTimeline(tmpDir, 5);
    const result = await handlePredictFailures({ path: tmpDir });

    const data = parseResult(result);
    const categoryKeys = Object.keys(data.categories);
    expect(categoryKeys).toContain('circular-deps');
    expect(categoryKeys).toContain('layer-violations');
    expect(categoryKeys).toContain('complexity');
    expect(categoryKeys).toContain('coupling');
    expect(categoryKeys).toContain('forbidden-imports');
    expect(categoryKeys).toContain('module-size');
    expect(categoryKeys).toContain('dependency-depth');
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/mcp/tools/predict-failures.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `test(mcp): add predict_failures MCP tool unit tests`

---

## Dependency Graph

```
Task 1 (predict.ts)          Task 4 (predict-failures.ts)
    |                              |
    v                              v
Task 2 (CLI tests)           Task 6 (MCP tests)
    |                              |
Task 3 (CLI index reg.)     Task 5 (MCP server reg.)
```

Tasks 1+4 are parallelizable. Tasks 2+6 are parallelizable (after their dependencies). Tasks 3+5 are parallelizable (after their dependencies).

## Traceability

| Observable Truth                         | Delivered by   |
| ---------------------------------------- | -------------- |
| 1. `--json` returns PredictionResult     | Task 1         |
| 2. Human-readable table output           | Task 1         |
| 3. `--category` filter                   | Task 1         |
| 4. `--no-roadmap` flag                   | Task 1         |
| 5. `--horizon` flag                      | Task 1         |
| 6. Error for < 3 snapshots (CLI)         | Task 1         |
| 7. MCP tool accepts params, returns JSON | Task 4         |
| 8. MCP rejects filesystem root           | Task 4, Task 6 |
| 9. MCP error for < 3 snapshots           | Task 4, Task 6 |
| 10. CLI tests pass                       | Task 2         |
| 11. MCP tests pass                       | Task 6         |
| 12. harness validate passes              | All tasks      |
