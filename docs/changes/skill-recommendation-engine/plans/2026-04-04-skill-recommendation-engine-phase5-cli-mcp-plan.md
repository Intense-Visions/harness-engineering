# Plan: Skill Recommendation Engine Phase 5 -- CLI + MCP Surfaces

**Date:** 2026-04-04
**Spec:** docs/changes/skill-recommendation-engine/proposal.md
**Estimated tasks:** 6
**Estimated time:** 25 minutes

## Goal

Wire the `recommend()` engine into a `harness recommend` CLI command and a `recommend_skills` MCP tool so users and agents can get health-aware skill recommendations.

## Observable Truths (Acceptance Criteria)

1. When `harness recommend` is invoked, the system shall print a human-readable sequenced skill workflow with urgency markers (`[CRITICAL]` for hard-rule matches, score for soft matches), followed by sequence reasoning.
2. When `harness recommend --json` is invoked, the system shall return valid JSON matching the `RecommendationResult` shape (`recommendations`, `snapshotAge`, `sequenceReasoning`).
3. When `harness recommend --no-cache` is invoked, the system shall force a fresh health snapshot capture regardless of cache freshness.
4. When `harness recommend --top 3` is invoked, the system shall limit output to 3 recommendations.
5. When `recommend_skills` MCP tool is called with `{ path, noCache?, top? }`, the system shall return structured `RecommendationResult` JSON wrapped in MCP content format.
6. The system shall register the CLI command via `createRecommendCommand()` in `packages/cli/src/index.ts`.
7. The system shall register the MCP tool definition and handler in `packages/cli/src/mcp/server.ts`.
8. `npx vitest run packages/cli/tests/commands/recommend.test.ts` passes with 6+ tests.
9. `npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts` passes with 5+ tests.

## File Map

- CREATE `packages/cli/src/commands/recommend.ts`
- CREATE `packages/cli/tests/commands/recommend.test.ts`
- CREATE `packages/cli/src/mcp/tools/recommend-skills.ts`
- CREATE `packages/cli/tests/mcp/tools/recommend-skills.test.ts`
- MODIFY `packages/cli/src/index.ts` (add import + `program.addCommand(createRecommendCommand())`)
- MODIFY `packages/cli/src/mcp/server.ts` (add import + definition + handler)

_Skeleton not produced -- task count (6) below threshold (8)._

## Tasks

### Task 1: Create `recommend.ts` CLI command with text and JSON output

**Depends on:** none
**Files:** `packages/cli/src/commands/recommend.ts`

1. Create `packages/cli/src/commands/recommend.ts` with the following content:

```typescript
import { Command } from 'commander';
import { OutputMode } from '../output/formatter';
import type { OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';
import { resolveConfig } from '../config/loader';
import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../skill/health-snapshot';
import type { HealthSnapshot } from '../skill/health-snapshot';
import { recommend } from '../skill/recommendation-engine';
import type { RecommendationResult, Recommendation } from '../skill/recommendation-types';
import { loadOrRebuildIndex } from '../skill/index-builder';
import chalk from 'chalk';

// ---------------------------------------------------------------------------
// Core logic (exported for testing)
// ---------------------------------------------------------------------------

export interface RecommendOptions {
  cwd?: string;
  noCache?: boolean;
  top?: number;
}

export async function runRecommend(options: RecommendOptions): Promise<RecommendationResult> {
  const cwd = options.cwd ?? process.cwd();
  const top = options.top ?? 5;

  // Resolve snapshot: use cache unless --no-cache or stale
  let snapshot: HealthSnapshot | null = null;

  if (!options.noCache) {
    const cached = loadCachedSnapshot(cwd);
    if (cached && isSnapshotFresh(cached, cwd)) {
      snapshot = cached;
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(cwd);
  }

  // Load skill index for address data
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', cwd, tierOverrides);

  // Build skills record from index (addresses + dependsOn)
  const skills: Record<
    string,
    { addresses: (typeof index.skills)[string]['addresses']; dependsOn: string[] }
  > = {};
  for (const [name, entry] of Object.entries(index.skills)) {
    skills[name] = { addresses: entry.addresses, dependsOn: entry.dependsOn };
  }

  const result = recommend(snapshot, skills, { top });

  // Set snapshotAge based on whether we used cache
  return {
    ...result,
    snapshotAge: options.noCache
      ? 'fresh'
      : snapshot === loadCachedSnapshot(cwd)
        ? 'cached'
        : result.snapshotAge,
  };
}

// ---------------------------------------------------------------------------
// Text formatting
// ---------------------------------------------------------------------------

function formatRecommendation(rec: Recommendation): string {
  const lines: string[] = [];

  if (rec.urgency === 'critical') {
    lines.push(`  ${chalk.red('[CRITICAL]')} ${rec.sequence}. ${rec.skillName}`);
  } else {
    lines.push(`  ${rec.sequence}. ${rec.skillName} (${rec.score.toFixed(2)})`);
  }

  for (const reason of rec.reasons) {
    lines.push(`     ${chalk.dim('\u2192')} ${reason}`);
  }

  return lines.join('\n');
}

function printRecommendations(result: RecommendationResult): void {
  if (result.recommendations.length === 0) {
    console.log('');
    console.log('No recommendations. Codebase health looks good!');
    console.log('');
    return;
  }

  console.log('');
  console.log(
    `Recommended workflow (${result.recommendations.length} skill${result.recommendations.length === 1 ? '' : 's'}):`
  );
  console.log('');

  for (const rec of result.recommendations) {
    console.log(formatRecommendation(rec));
    console.log('');
  }

  console.log(`Sequence reasoning: ${result.sequenceReasoning}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function createRecommendCommand(): Command {
  const command = new Command('recommend')
    .description('Recommend skills based on codebase health analysis')
    .option('--no-cache', 'Force fresh health snapshot')
    .option('--top <n>', 'Max recommendations (default 5)', '5')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json ? OutputMode.JSON : OutputMode.TEXT;

      try {
        const top = parseInt(opts.top, 10);
        if (isNaN(top) || top < 1) {
          logger.error('--top must be a positive integer');
          process.exit(1);
        }

        if (mode === OutputMode.TEXT) {
          console.log('');
          console.log('Analyzing codebase health...');
        }

        const result = await runRecommend({
          noCache: opts.cache === false,
          top,
        });

        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          printRecommendations(result);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: message }));
        } else {
          logger.error(message);
        }
        process.exit(1);
      }
    });

  return command;
}
```

2. Run: `npx harness validate`
3. Commit: `feat(recommend): add harness recommend CLI command`

---

### Task 2: Write tests for the CLI command

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/recommend.test.ts`

1. Create `packages/cli/tests/commands/recommend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecommendCommand, runRecommend } from '../../src/commands/recommend';

// Mock the heavy dependencies
vi.mock('../../src/skill/health-snapshot', () => ({
  captureHealthSnapshot: vi.fn(),
  loadCachedSnapshot: vi.fn(),
  isSnapshotFresh: vi.fn(),
}));

vi.mock('../../src/skill/recommendation-engine', () => ({
  recommend: vi.fn(),
}));

vi.mock('../../src/skill/index-builder', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../src/config/loader', () => ({
  resolveConfig: vi.fn(() => ({ ok: true, value: {} })),
}));

import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../src/skill/health-snapshot';
import { recommend } from '../../src/skill/recommendation-engine';
import { loadOrRebuildIndex } from '../../src/skill/index-builder';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
import type { RecommendationResult } from '../../src/skill/recommendation-types';

const MOCK_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-04T00:00:00.000Z',
  gitHead: 'abc1234',
  projectPath: '/tmp/test',
  checks: {
    deps: { passed: false, issueCount: 3, circularDeps: 2, layerViolations: 1 },
    entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
    security: { passed: true, findingCount: 0, criticalCount: 0 },
    perf: { passed: true, violationCount: 0 },
    docs: { passed: true, undocumentedCount: 0 },
    lint: { passed: true, issueCount: 0 },
  },
  metrics: {
    avgFanOut: 5,
    maxFanOut: 12,
    avgCyclomaticComplexity: 4,
    maxCyclomaticComplexity: 8,
    avgCouplingRatio: 0.3,
    testCoverage: 72,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: ['circular-deps', 'layer-violations'],
};

const MOCK_RESULT: RecommendationResult = {
  recommendations: [
    {
      skillName: 'harness-enforce-architecture',
      score: 1.0,
      urgency: 'critical',
      reasons: ["[CRITICAL] Signal 'circular-deps' is active"],
      sequence: 1,
      triggeredBy: ['circular-deps'],
    },
    {
      skillName: 'harness-dependency-health',
      score: 0.65,
      urgency: 'nice-to-have',
      reasons: ["Signal 'layer-violations' is active (weight 0.5)"],
      sequence: 2,
      triggeredBy: ['layer-violations'],
    },
  ],
  snapshotAge: 'fresh',
  sequenceReasoning:
    '1 critical issue(s) detected. Sequence: 1. harness-enforce-architecture -> 2. harness-dependency-health.',
};

const MOCK_INDEX = {
  version: 1,
  hash: 'test',
  generatedAt: '2026-04-04',
  skills: {
    'harness-enforce-architecture': {
      tier: 1,
      description: 'Enforce architecture',
      keywords: [],
      stackSignals: [],
      cognitiveMode: undefined,
      phases: [],
      source: 'bundled' as const,
      addresses: [],
      dependsOn: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_INDEX);
  (recommend as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_RESULT);
});

describe('createRecommendCommand', () => {
  it('creates command with correct name', () => {
    const cmd = createRecommendCommand();
    expect(cmd.name()).toBe('recommend');
  });

  it('has --no-cache option', () => {
    const cmd = createRecommendCommand();
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--no-cache');
  });

  it('has --top option', () => {
    const cmd = createRecommendCommand();
    const opts = cmd.options.map((o) => o.long);
    expect(opts).toContain('--top');
  });
});

describe('runRecommend', () => {
  it('uses cached snapshot when fresh and cache not disabled', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).not.toHaveBeenCalled();
    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 5 });
  });

  it('captures fresh snapshot when cache is stale', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('forces fresh snapshot when noCache is true', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(loadCachedSnapshot).not.toHaveBeenCalled();
    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('passes top option to recommend()', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test', noCache: true, top: 3 });

    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 3 });
  });

  it('returns RecommendationResult shape', async () => {
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    const result = await runRecommend({ cwd: '/tmp/test', noCache: true });

    expect(result).toHaveProperty('recommendations');
    expect(result).toHaveProperty('snapshotAge');
    expect(result).toHaveProperty('sequenceReasoning');
    expect(result.recommendations).toHaveLength(2);
  });

  it('captures fresh snapshot when no cache exists', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(null);
    (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);

    await runRecommend({ cwd: '/tmp/test' });

    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/commands/recommend.test.ts`
3. Observe: all tests pass
4. Run: `npx harness validate`
5. Commit: `test(recommend): add CLI command unit tests`

---

### Task 3: Register CLI command in index.ts

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import at line 59 (after the predict import):

```typescript
import { createRecommendCommand } from './commands/recommend';
```

2. Add registration at line 125 (after `createPredictCommand()`):

```typescript
program.addCommand(createRecommendCommand());
```

3. Run: `npx harness validate`
4. Commit: `feat(recommend): register harness recommend in CLI router`

---

### Task 4: Create `recommend-skills.ts` MCP tool definition and handler

**Depends on:** none
**Files:** `packages/cli/src/mcp/tools/recommend-skills.ts`

1. Create `packages/cli/src/mcp/tools/recommend-skills.ts`:

```typescript
import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../skill/health-snapshot.js';
import type { HealthSnapshot } from '../../skill/health-snapshot.js';
import { recommend } from '../../skill/recommendation-engine.js';
import { loadOrRebuildIndex } from '../../skill/index-builder.js';
import { resolveConfig } from '../../config/loader.js';

export const recommendSkillsDefinition = {
  name: 'recommend_skills',
  description:
    'Recommend skills based on codebase health. Returns sequenced workflow with urgency markers.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: {
        type: 'string',
        description: 'Project root path (defaults to cwd)',
      },
      noCache: {
        type: 'boolean',
        description: 'Force fresh health snapshot even if cache is fresh',
      },
      top: {
        type: 'number',
        description: 'Max recommendations to return (default 5)',
      },
    },
    required: [] as string[],
  },
};

export async function handleRecommendSkills(
  input: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const projectRoot = (input.path as string) || process.cwd();
  const noCache = (input.noCache as boolean) || false;
  const top = (input.top as number) || 5;

  // Resolve snapshot
  let snapshot: HealthSnapshot | null = null;

  if (!noCache) {
    const cached = loadCachedSnapshot(projectRoot);
    if (cached && isSnapshotFresh(cached, projectRoot)) {
      snapshot = cached;
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(projectRoot);
  }

  // Load skill index
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', projectRoot, tierOverrides);

  // Build skills record
  const skills: Record<
    string,
    { addresses: (typeof index.skills)[string]['addresses']; dependsOn: string[] }
  > = {};
  for (const [name, entry] of Object.entries(index.skills)) {
    skills[name] = { addresses: entry.addresses, dependsOn: entry.dependsOn };
  }

  const result = recommend(snapshot, skills, { top });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
```

2. Run: `npx harness validate`
3. Commit: `feat(recommend): add recommend_skills MCP tool`

---

### Task 5: Write tests for the MCP tool

**Depends on:** Task 4
**Files:** `packages/cli/tests/mcp/tools/recommend-skills.test.ts`

1. Create `packages/cli/tests/mcp/tools/recommend-skills.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recommendSkillsDefinition,
  handleRecommendSkills,
} from '../../../src/mcp/tools/recommend-skills.js';

// Mock dependencies
vi.mock('../../../src/skill/health-snapshot', () => ({
  captureHealthSnapshot: vi.fn(),
  loadCachedSnapshot: vi.fn(),
  isSnapshotFresh: vi.fn(),
}));

vi.mock('../../../src/skill/recommendation-engine', () => ({
  recommend: vi.fn(),
}));

vi.mock('../../../src/skill/index-builder', () => ({
  loadOrRebuildIndex: vi.fn(),
}));

vi.mock('../../../src/config/loader', () => ({
  resolveConfig: vi.fn(() => ({ ok: true, value: {} })),
}));

import {
  captureHealthSnapshot,
  loadCachedSnapshot,
  isSnapshotFresh,
} from '../../../src/skill/health-snapshot';
import { recommend } from '../../../src/skill/recommendation-engine';
import { loadOrRebuildIndex } from '../../../src/skill/index-builder';
import type { HealthSnapshot } from '../../../src/skill/health-snapshot';

const MOCK_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-04T00:00:00.000Z',
  gitHead: 'abc1234',
  projectPath: '/tmp/test',
  checks: {
    deps: { passed: true, issueCount: 0, circularDeps: 0, layerViolations: 0 },
    entropy: { passed: true, deadExports: 0, deadFiles: 0, driftCount: 0 },
    security: { passed: true, findingCount: 0, criticalCount: 0 },
    perf: { passed: true, violationCount: 0 },
    docs: { passed: true, undocumentedCount: 0 },
    lint: { passed: true, issueCount: 0 },
  },
  metrics: {
    avgFanOut: 5,
    maxFanOut: 12,
    avgCyclomaticComplexity: 4,
    maxCyclomaticComplexity: 8,
    avgCouplingRatio: 0.3,
    testCoverage: 72,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: ['circular-deps'],
};

const MOCK_RESULT = {
  recommendations: [
    {
      skillName: 'harness-enforce-architecture',
      score: 1.0,
      urgency: 'critical',
      reasons: ['Signal active'],
      sequence: 1,
      triggeredBy: ['circular-deps'],
    },
  ],
  snapshotAge: 'fresh',
  sequenceReasoning: 'Test reasoning.',
};

const MOCK_INDEX = {
  version: 1,
  hash: 'test',
  generatedAt: '2026-04-04',
  skills: {
    'harness-enforce-architecture': {
      tier: 1,
      description: 'Enforce',
      keywords: [],
      stackSignals: [],
      cognitiveMode: undefined,
      phases: [],
      source: 'bundled' as const,
      addresses: [],
      dependsOn: [],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  (loadOrRebuildIndex as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_INDEX);
  (recommend as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_RESULT);
  (captureHealthSnapshot as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_SNAPSHOT);
});

// ── Definition tests ──────────────────────────────────────────────

describe('recommend_skills definition', () => {
  it('has correct name', () => {
    expect(recommendSkillsDefinition.name).toBe('recommend_skills');
  });

  it('has path, noCache, and top properties', () => {
    const props = recommendSkillsDefinition.inputSchema.properties;
    expect(props).toHaveProperty('path');
    expect(props).toHaveProperty('noCache');
    expect(props).toHaveProperty('top');
  });

  it('has no required parameters', () => {
    expect(recommendSkillsDefinition.inputSchema.required).toEqual([]);
  });
});

// ── Handler tests ─────────────────────────────────────────────────

describe('handleRecommendSkills', () => {
  it('returns MCP content shape with JSON result', async () => {
    const result = await handleRecommendSkills({ path: '/tmp/test', noCache: true });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveProperty('recommendations');
    expect(parsed).toHaveProperty('snapshotAge');
    expect(parsed).toHaveProperty('sequenceReasoning');
  });

  it('uses cached snapshot when fresh', async () => {
    (loadCachedSnapshot as ReturnType<typeof vi.fn>).mockReturnValue(MOCK_SNAPSHOT);
    (isSnapshotFresh as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await handleRecommendSkills({ path: '/tmp/test' });

    expect(captureHealthSnapshot).not.toHaveBeenCalled();
    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 5 });
  });

  it('forces fresh snapshot when noCache is true', async () => {
    await handleRecommendSkills({ path: '/tmp/test', noCache: true });

    expect(loadCachedSnapshot).not.toHaveBeenCalled();
    expect(captureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('passes top parameter to recommend()', async () => {
    await handleRecommendSkills({ path: '/tmp/test', noCache: true, top: 3 });

    expect(recommend).toHaveBeenCalledWith(MOCK_SNAPSHOT, expect.any(Object), { top: 3 });
  });

  it('defaults to cwd when path not provided', async () => {
    await handleRecommendSkills({});

    expect(captureHealthSnapshot).toHaveBeenCalledWith(process.cwd());
  });
});
```

2. Run test: `npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts`
3. Observe: all tests pass
4. Run: `npx harness validate`
5. Commit: `test(recommend): add recommend_skills MCP tool tests`

---

### Task 6: Register MCP tool in server.ts

**Depends on:** Task 4
**Files:** `packages/cli/src/mcp/server.ts`

1. Add import after line 131 (after the `predictFailuresDefinition` import):

```typescript
import { recommendSkillsDefinition, handleRecommendSkills } from './tools/recommend-skills.js';
```

2. Add `recommendSkillsDefinition` to the `TOOL_DEFINITIONS` array (after `predictFailuresDefinition` on line 199):

```typescript
  predictFailuresDefinition,
  recommendSkillsDefinition,
```

3. Add handler to `TOOL_HANDLERS` object (after `predict_failures` entry on line 253):

```typescript
  predict_failures: handlePredictFailures as ToolHandler,
  recommend_skills: handleRecommendSkills as ToolHandler,
```

4. Run: `npx vitest run packages/cli/tests/mcp/tools/recommend-skills.test.ts`
5. Run: `npx harness validate`
6. Commit: `feat(recommend): register recommend_skills in MCP server`

---

## Traceability

| Observable Truth                              | Delivered by                       |
| --------------------------------------------- | ---------------------------------- |
| 1. CLI prints human-readable output           | Task 1 (printRecommendations)      |
| 2. `--json` returns RecommendationResult JSON | Task 1 (JSON branch in action)     |
| 3. `--no-cache` forces fresh snapshot         | Task 1 (runRecommend noCache path) |
| 4. `--top N` limits recommendations           | Task 1 (top option parsing)        |
| 5. MCP tool returns structured JSON           | Task 4 (handleRecommendSkills)     |
| 6. CLI registered in index.ts                 | Task 3                             |
| 7. MCP tool registered in server.ts           | Task 6                             |
| 8. CLI tests pass                             | Task 2                             |
| 9. MCP tool tests pass                        | Task 5                             |
