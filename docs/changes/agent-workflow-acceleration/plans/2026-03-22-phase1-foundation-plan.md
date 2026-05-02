# Plan: Phase 1 Foundation -- Internal Caching & Parallelization

**Date:** 2026-03-22
**Spec:** docs/changes/agent-workflow-acceleration/proposal.md
**Estimated tasks:** 4
**Estimated time:** 20 minutes

## Goal

Add GraphStore singleton cache, learnings/failures index cache, and parallelized CI/mechanical checks -- all internal optimizations with zero behavioral changes.

## Observable Truths (Acceptance Criteria)

1. When `loadGraphStore(path)` is called twice with unchanged `graph.json` mtime, the system shall return the same cached `GraphStore` instance and the second call shall complete in <5ms.
2. When `graph.json` mtime changes between calls, `loadGraphStore(path)` shall return a freshly loaded `GraphStore`.
3. When `loadRelevantLearnings(path, skill)` is called twice with unchanged `learnings.md` mtime, the system shall return cached results and the second call shall complete in <5ms.
4. When `learnings.md` mtime changes, `loadRelevantLearnings()` shall invalidate the cache and re-parse.
5. When `loadFailures(path)` is called twice with unchanged `failures.md` mtime, the system shall return cached results and the second call shall complete in <5ms.
6. When `runCIChecks()` executes, the system shall run `validate` first, then run `deps`, `docs`, `entropy`, `security`, `perf`, `phase-gate` in parallel via `Promise.all`.
7. When `runMechanicalChecks()` executes, the system shall run `validate` and `check-deps` sequentially first (pipeline-stopping checks), then run `check-docs` and `security-scan` in parallel.
8. The system shall produce identical output from all cached/parallelized functions compared to the current sequential/uncached versions (verified by existing tests passing unchanged).
9. `npx turbo run test` passes. `harness validate` passes.

## File Map

```
MODIFY packages/mcp-server/src/utils/graph-loader.ts           -- add singleton cache with mtime invalidation
CREATE packages/mcp-server/tests/utils/graph-loader.test.ts     -- cache hit, cache miss, mtime invalidation tests
MODIFY packages/core/src/state/state-manager.ts                 -- add learnings/failures index cache
CREATE packages/core/tests/state/state-manager-cache.test.ts    -- cache hit, invalidation, cross-skill tests
MODIFY packages/core/src/ci/check-orchestrator.ts               -- parallelize independent checks
MODIFY packages/core/tests/ci/check-orchestrator.test.ts        -- add parallelization assertion
MODIFY packages/core/src/review/mechanical-checks.ts            -- parallelize warning-only checks
CREATE packages/core/tests/review/mechanical-checks-parallel.test.ts -- parallelization test
```

## Tasks

### Task 1: GraphStore singleton cache in graph-loader.ts (TDD)

**Depends on:** none
**Files:** `packages/mcp-server/tests/utils/graph-loader.test.ts`, `packages/mcp-server/src/utils/graph-loader.ts`

1. Create test file `packages/mcp-server/tests/utils/graph-loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as path from 'path';

// Mock @harness-engineering/graph
const mockLoad = vi.fn().mockResolvedValue(true);
const MockGraphStore = vi.fn().mockImplementation(() => ({
  load: mockLoad,
  nodeCount: 5,
}));

vi.mock('@harness-engineering/graph', () => ({
  GraphStore: MockGraphStore,
}));

// Mock fs/promises for stat
const mockStat = vi.fn();
vi.mock('fs/promises', () => ({
  stat: (...args: unknown[]) => mockStat(...args),
}));

import { loadGraphStore, clearGraphStoreCache } from '../../src/utils/graph-loader.js';

describe('loadGraphStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGraphStoreCache();
  });

  it('returns a GraphStore on first call', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store = await loadGraphStore('/project');
    expect(store).not.toBeNull();
    expect(MockGraphStore).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('returns cached instance on second call with same mtime', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store1 = await loadGraphStore('/project');
    const store2 = await loadGraphStore('/project');
    expect(store1).toBe(store2);
    expect(MockGraphStore).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('cached call completes in <5ms', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    await loadGraphStore('/project');
    const start = performance.now();
    await loadGraphStore('/project');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });

  it('reloads when mtime changes', async () => {
    mockStat.mockResolvedValueOnce({ mtimeMs: 1000 });
    await loadGraphStore('/project');
    mockStat.mockResolvedValueOnce({ mtimeMs: 2000 });
    await loadGraphStore('/project');
    expect(MockGraphStore).toHaveBeenCalledTimes(2);
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it('returns null when load fails', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    mockLoad.mockResolvedValueOnce(false);
    const store = await loadGraphStore('/project');
    expect(store).toBeNull();
  });

  it('returns null when graph.json does not exist (stat throws)', async () => {
    mockStat.mockRejectedValue(new Error('ENOENT'));
    const store = await loadGraphStore('/project');
    expect(store).toBeNull();
  });

  it('caches by path -- different paths get different instances', async () => {
    mockStat.mockResolvedValue({ mtimeMs: 1000 });
    const store1 = await loadGraphStore('/project-a');
    const store2 = await loadGraphStore('/project-b');
    expect(store1).not.toBe(store2);
    expect(MockGraphStore).toHaveBeenCalledTimes(2);
  });
});
```

2. Run test: `cd packages/mcp-server && npx vitest run tests/utils/graph-loader.test.ts`
3. Observe failure: `clearGraphStoreCache` is not exported, cache logic does not exist.
4. Modify `packages/mcp-server/src/utils/graph-loader.ts`:

```typescript
import * as path from 'path';
import { stat } from 'fs/promises';

interface CachedStore {
  store: Awaited<ReturnType<typeof doLoadGraphStore>>;
  mtimeMs: number;
}

const cache = new Map<string, CachedStore>();

export function clearGraphStoreCache(): void {
  cache.clear();
}

async function doLoadGraphStore(projectRoot: string) {
  const { GraphStore } = await import('@harness-engineering/graph');
  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const store = new GraphStore();
  const loaded = await store.load(graphDir);
  if (!loaded) return null;
  return store;
}

export async function loadGraphStore(projectRoot: string) {
  const graphDir = path.join(projectRoot, '.harness', 'graph');
  const graphPath = path.join(graphDir, 'graph.json');

  let mtimeMs: number;
  try {
    const stats = await stat(graphPath);
    mtimeMs = stats.mtimeMs;
  } catch {
    // graph.json does not exist
    return null;
  }

  const cached = cache.get(projectRoot);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.store;
  }

  const store = await doLoadGraphStore(projectRoot);
  if (store !== null) {
    cache.set(projectRoot, { store, mtimeMs });
  }
  return store;
}
```

5. Run test: `cd packages/mcp-server && npx vitest run tests/utils/graph-loader.test.ts`
6. Observe: all tests pass
7. Run: `harness validate`
8. Commit: `perf(mcp-server): add GraphStore singleton cache with mtime invalidation`

---

### Task 2: Learnings/failures index cache in state-manager.ts (TDD)

**Depends on:** none
**Files:** `packages/core/tests/state/state-manager-cache.test.ts`, `packages/core/src/state/state-manager.ts`

1. Create test file `packages/core/tests/state/state-manager-cache.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadRelevantLearnings,
  loadFailures,
  appendLearning,
  appendFailure,
  clearLearningsCache,
  clearFailuresCache,
} from '../../src/state/state-manager';

describe('loadRelevantLearnings cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cache-'));
    clearLearningsCache();
    clearFailuresCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('second call with same mtime returns in <5ms', async () => {
    await appendLearning(tmpDir, 'Learning A', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Learning B', 'harness-execution', 'gotcha');

    // First call populates cache
    await loadRelevantLearnings(tmpDir);

    // Second call should be cached
    const start = performance.now();
    const result = await loadRelevantLearnings(tmpDir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(2);
    }
  });

  it('cache filters by skill correctly on cached data', async () => {
    await appendLearning(tmpDir, 'TDD learning', 'harness-tdd', 'success');
    await appendLearning(tmpDir, 'Exec learning', 'harness-execution', 'gotcha');

    // Populate cache with unfiltered call
    await loadRelevantLearnings(tmpDir);

    // Filtered call should still work from cache
    const result = await loadRelevantLearnings(tmpDir, 'harness-tdd');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
      expect(result.value[0]).toContain('harness-tdd');
    }
  });

  it('invalidates cache when file changes', async () => {
    await appendLearning(tmpDir, 'Learning A');
    const result1 = await loadRelevantLearnings(tmpDir);

    // Append changes mtime
    await appendLearning(tmpDir, 'Learning B');
    const result2 = await loadRelevantLearnings(tmpDir);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result2.value.length).toBe(result1.value.length + 1);
    }
  });

  it('returns empty array when no file (no cache pollution)', async () => {
    const result = await loadRelevantLearnings(tmpDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('loadFailures cache', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-cache-'));
    clearLearningsCache();
    clearFailuresCache();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('second call with same mtime returns in <5ms', async () => {
    await appendFailure(tmpDir, 'Failure A', 'harness-tdd', 'test-fail');

    // First call
    await loadFailures(tmpDir);

    // Second call should be cached
    const start = performance.now();
    const result = await loadFailures(tmpDir);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(1);
    }
  });

  it('invalidates cache when file changes', async () => {
    await appendFailure(tmpDir, 'Failure A', 'harness-tdd', 'test-fail');
    const result1 = await loadFailures(tmpDir);

    await appendFailure(tmpDir, 'Failure B', 'harness-execution', 'lint-fail');
    const result2 = await loadFailures(tmpDir);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (result1.ok && result2.ok) {
      expect(result2.value.length).toBe(result1.value.length + 1);
    }
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/state/state-manager-cache.test.ts`
3. Observe failure: `clearLearningsCache` and `clearFailuresCache` are not exported.
4. Modify `packages/core/src/state/state-manager.ts`. Add the following cache infrastructure after the constant declarations (after line 24):

```typescript
// ── Cache infrastructure ─────────────────────────────────────────────

interface LearningsCache {
  mtimeMs: number;
  entries: string[];
}

interface FailuresCache {
  mtimeMs: number;
  entries: Array<{ date: string; skill: string; type: string; description: string }>;
}

const learningsCacheMap = new Map<string, LearningsCache>();
const failuresCacheMap = new Map<string, FailuresCache>();

export function clearLearningsCache(): void {
  learningsCacheMap.clear();
}

export function clearFailuresCache(): void {
  failuresCacheMap.clear();
}
```

5. Modify `loadRelevantLearnings` to check cache before reading file. Replace the function body (lines 150-203) with:

```typescript
export async function loadRelevantLearnings(
  projectPath: string,
  skillName?: string,
  stream?: string
): Promise<Result<string[], Error>> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const learningsPath = path.join(stateDir, LEARNINGS_FILE);

    if (!fs.existsSync(learningsPath)) {
      return Ok([]);
    }

    // Cache check: use mtime to determine if re-parse is needed
    const stats = fs.statSync(learningsPath);
    const cacheKey = learningsPath;
    const cached = learningsCacheMap.get(cacheKey);

    let entries: string[];

    if (cached && cached.mtimeMs === stats.mtimeMs) {
      entries = cached.entries;
    } else {
      // Parse file and populate cache
      const content = fs.readFileSync(learningsPath, 'utf-8');
      const lines = content.split('\n');
      entries = [];
      let currentBlock: string[] = [];

      for (const line of lines) {
        if (line.startsWith('# ')) continue;

        const isDatedBullet = /^- \*\*\d{4}-\d{2}-\d{2}/.test(line);
        const isHeading = /^## \d{4}-\d{2}-\d{2}/.test(line);

        if (isDatedBullet || isHeading) {
          if (currentBlock.length > 0) {
            entries.push(currentBlock.join('\n'));
          }
          currentBlock = [line];
        } else if (line.trim() !== '' && currentBlock.length > 0) {
          currentBlock.push(line);
        }
      }

      if (currentBlock.length > 0) {
        entries.push(currentBlock.join('\n'));
      }

      learningsCacheMap.set(cacheKey, { mtimeMs: stats.mtimeMs, entries });
    }

    if (!skillName) {
      return Ok(entries);
    }

    const filtered = entries.filter((entry) => entry.includes(`[skill:${skillName}]`));
    return Ok(filtered);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load learnings: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
```

6. Modify `loadFailures` to check cache before reading file. Replace the function body (lines 243-282) with:

```typescript
export async function loadFailures(
  projectPath: string,
  stream?: string
): Promise<
  Result<Array<{ date: string; skill: string; type: string; description: string }>, Error>
> {
  try {
    const dirResult = await getStateDir(projectPath, stream);
    if (!dirResult.ok) return dirResult;
    const stateDir = dirResult.value;
    const failuresPath = path.join(stateDir, FAILURES_FILE);

    if (!fs.existsSync(failuresPath)) {
      return Ok([]);
    }

    // Cache check: use mtime to determine if re-parse is needed
    const stats = fs.statSync(failuresPath);
    const cacheKey = failuresPath;
    const cached = failuresCacheMap.get(cacheKey);

    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return Ok(cached.entries);
    }

    const content = fs.readFileSync(failuresPath, 'utf-8');
    const entries: Array<{ date: string; skill: string; type: string; description: string }> = [];

    for (const line of content.split('\n')) {
      const match = line.match(FAILURE_LINE_REGEX);
      if (match) {
        entries.push({
          date: match[1] ?? '',
          skill: match[2] ?? '',
          type: match[3] ?? '',
          description: match[4] ?? '',
        });
      }
    }

    failuresCacheMap.set(cacheKey, { mtimeMs: stats.mtimeMs, entries });
    return Ok(entries);
  } catch (error) {
    return Err(
      new Error(
        `Failed to load failures: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
}
```

7. Run test: `cd packages/core && npx vitest run tests/state/state-manager-cache.test.ts`
8. Observe: all tests pass
9. Run existing tests to verify no regressions: `cd packages/core && npx vitest run tests/state/`
10. Run: `harness validate`
11. Commit: `perf(core): add mtime-based cache for learnings and failures parsing`

---

### Task 3: Parallelize check-orchestrator.ts (TDD)

**Depends on:** none
**Files:** `packages/core/src/ci/check-orchestrator.ts`, `packages/core/tests/ci/check-orchestrator.test.ts`

1. Add a parallelization test to the existing test file `packages/core/tests/ci/check-orchestrator.test.ts`. Append before the closing `});`:

```typescript
it('runs independent checks in parallel (validate first, then others)', async () => {
  // Track call order using timestamps
  const callOrder: string[] = [];
  const { validateAgentsMap } = await import('../../src/context/agents-map');
  vi.mocked(validateAgentsMap).mockImplementation(async () => {
    callOrder.push('validate');
    return { ok: true, value: { valid: true } } as any;
  });

  const result = await runCIChecks({
    projectRoot: '/fake',
    config: minimalConfig(),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;

  // validate must be the first check to start
  expect(callOrder[0]).toBe('validate');

  // All checks still produce results
  expect(result.value.checks).toHaveLength(7);
  expect(result.value.checks.map((c) => c.name)).toEqual([
    'validate',
    'deps',
    'docs',
    'entropy',
    'security',
    'perf',
    'phase-gate',
  ]);
});

it('preserves check ordering in output even with parallel execution', async () => {
  const result = await runCIChecks({
    projectRoot: '/fake',
    config: minimalConfig(),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  // Output order must match ALL_CHECKS order regardless of completion order
  expect(result.value.checks.map((c) => c.name)).toEqual([
    'validate',
    'deps',
    'docs',
    'entropy',
    'security',
    'perf',
    'phase-gate',
  ]);
});
```

2. Run test: `cd packages/core && npx vitest run tests/ci/check-orchestrator.test.ts`
3. Observe: tests pass (current sequential code still satisfies the contract). This is expected -- the parallelization is a performance optimization, not a behavioral change.
4. Modify `packages/core/src/ci/check-orchestrator.ts`. Replace the `runCIChecks` function (lines 277-308) with:

```typescript
export async function runCIChecks(input: RunCIChecksInput): Promise<Result<CICheckReport, Error>> {
  const { projectRoot, config, skip = [], failOn = 'error' } = input;

  try {
    const checks: CICheckResult[] = [];
    const skippedSet = new Set(skip);

    // Phase 1: validate runs first (deps may depend on config resolution)
    if (skippedSet.has('validate')) {
      checks.push({ name: 'validate', status: 'skip', issues: [], durationMs: 0 });
    } else {
      checks.push(await runSingleCheck('validate', projectRoot, config));
    }

    // Phase 2: all remaining checks in parallel
    const remainingChecks: CICheckName[] = [
      'deps',
      'docs',
      'entropy',
      'security',
      'perf',
      'phase-gate',
    ];
    const phase2Results = await Promise.all(
      remainingChecks.map(async (name) => {
        if (skippedSet.has(name)) {
          return { name, status: 'skip' as const, issues: [] as CICheckIssue[], durationMs: 0 };
        }
        return runSingleCheck(name, projectRoot, config);
      })
    );
    checks.push(...phase2Results);

    const summary = buildSummary(checks);
    const exitCode = determineExitCode(summary, failOn);

    const report: CICheckReport = {
      version: 1,
      project: (config.name as string) ?? 'unknown',
      timestamp: new Date().toISOString(),
      checks,
      summary,
      exitCode,
    };

    return Ok(report);
  } catch (error) {
    return Err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

5. Run test: `cd packages/core && npx vitest run tests/ci/check-orchestrator.test.ts`
6. Observe: all tests pass (including new ones)
7. Run: `harness validate`
8. Commit: `perf(core): parallelize independent CI checks in check-orchestrator`

---

### Task 4: Parallelize mechanical-checks.ts warning-only checks (TDD)

**Depends on:** none
**Files:** `packages/core/src/review/mechanical-checks.ts`, `packages/core/tests/review/mechanical-checks-parallel.test.ts`

1. Create test file `packages/core/tests/review/mechanical-checks-parallel.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/context/agents-map', () => ({
  validateAgentsMap: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true },
  }),
}));

vi.mock('../../src/constraints/dependencies', () => ({
  validateDependencies: vi.fn().mockResolvedValue({
    ok: true,
    value: { valid: true, violations: [], graph: { nodes: [], edges: [] } },
  }),
  defineLayer: vi.fn().mockReturnValue({ name: 'test', patterns: [], allowed: [] }),
}));

vi.mock('../../src/context/doc-coverage', () => ({
  checkDocCoverage: vi.fn().mockResolvedValue({
    ok: true,
    value: {
      domain: 'test',
      documented: [],
      undocumented: [],
      coveragePercentage: 100,
      gaps: [],
    },
  }),
}));

vi.mock('../../src/security/scanner', () => ({
  SecurityScanner: class {
    configureForProject = vi.fn();
    scanFiles = vi.fn().mockResolvedValue({
      findings: [],
      scannedFiles: 0,
      rulesApplied: 0,
      externalToolsUsed: [],
      coverage: 'baseline',
    });
  },
}));

vi.mock('../../src/security/config', () => ({
  parseSecurityConfig: vi
    .fn()
    .mockReturnValue({ enabled: true, strict: false, exclude: ['**/node_modules/**'] }),
}));

vi.mock('../../src/shared/parsers', () => ({
  TypeScriptParser: class {},
}));

import { runMechanicalChecks } from '../../src/review/mechanical-checks';

describe('runMechanicalChecks parallelization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('produces all check statuses (validates parallel execution collects all results)', async () => {
    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.validate).toBe('pass');
    expect(result.value.checks.checkDeps).toBe('pass');
    expect(result.value.checks.checkDocs).toBe('pass');
    expect(result.value.checks.securityScan).toBe('pass');
  });

  it('still stops pipeline when validate fails even with parallel warning checks', async () => {
    const { validateAgentsMap } = await import('../../src/context/agents-map');
    vi.mocked(validateAgentsMap).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'PARSE_ERROR',
        message: 'AGENTS.md broken',
        details: {},
        suggestions: [],
      },
    });

    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stopPipeline).toBe(true);
    expect(result.value.checks.validate).toBe('fail');
  });

  it('skips checks when listed in skip array', async () => {
    const result = await runMechanicalChecks({
      projectRoot: '/fake',
      config: {},
      changedFiles: [],
      skip: ['validate', 'check-docs'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.checks.validate).toBe('skip');
    expect(result.value.checks.checkDocs).toBe('skip');
    expect(result.value.checks.checkDeps).toBe('pass');
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/review/mechanical-checks-parallel.test.ts`
3. Observe: tests should pass with the current sequential code (behavioral contract is unchanged).
4. Modify `packages/core/src/review/mechanical-checks.ts`. Replace the `runMechanicalChecks` function body (lines 25-232) to parallelize `check-docs` and `security-scan`:

The key structural change: extract each check into a helper, run `validate` and `check-deps` sequentially (they can stop the pipeline), then run `check-docs` and `security-scan` in parallel.

```typescript
export async function runMechanicalChecks(
  options: MechanicalCheckOptions
): Promise<Result<MechanicalCheckResult, Error>> {
  const { projectRoot, config, skip = [], changedFiles } = options;
  const findings: MechanicalFinding[] = [];

  const statuses: Record<CheckName, MechanicalCheckStatus> = {
    validate: 'skip',
    'check-deps': 'skip',
    'check-docs': 'skip',
    'security-scan': 'skip',
  };

  // --- Phase 1: Sequential pipeline-stopping checks ---

  // --- Validate ---
  if (!skip.includes('validate')) {
    try {
      const agentsPath = path.join(projectRoot, (config.agentsMapPath as string) ?? 'AGENTS.md');
      const result = await validateAgentsMap(agentsPath);
      if (!result.ok) {
        statuses.validate = 'fail';
        findings.push({
          tool: 'validate',
          file: agentsPath,
          message: result.error.message,
          severity: 'error',
        });
      } else if (!result.value.valid) {
        statuses.validate = 'fail';
        if (result.value.errors) {
          for (const err of result.value.errors) {
            findings.push({
              tool: 'validate',
              file: agentsPath,
              message: err.message,
              severity: 'error',
            });
          }
        }
        for (const section of result.value.missingSections) {
          findings.push({
            tool: 'validate',
            file: agentsPath,
            message: `Missing section: ${section}`,
            severity: 'warning',
          });
        }
      } else {
        statuses.validate = 'pass';
      }
    } catch (err) {
      statuses.validate = 'fail';
      findings.push({
        tool: 'validate',
        file: path.join(projectRoot, 'AGENTS.md'),
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Check-deps ---
  if (!skip.includes('check-deps')) {
    try {
      const rawLayers = config.layers as Array<Record<string, unknown>> | undefined;
      if (rawLayers && rawLayers.length > 0) {
        const parser = new TypeScriptParser();
        const layers = rawLayers.map((l) =>
          defineLayer(
            l.name as string,
            Array.isArray(l.patterns) ? (l.patterns as string[]) : [l.pattern as string],
            l.allowedDependencies as string[]
          )
        );
        const result = await validateDependencies({
          layers,
          rootDir: projectRoot,
          parser,
        });
        if (!result.ok) {
          statuses['check-deps'] = 'fail';
          findings.push({
            tool: 'check-deps',
            file: projectRoot,
            message: result.error.message,
            severity: 'error',
          });
        } else if (result.value.violations.length > 0) {
          statuses['check-deps'] = 'fail';
          for (const v of result.value.violations) {
            findings.push({
              tool: 'check-deps',
              file: v.file,
              line: v.line,
              message: `Layer violation: ${v.fromLayer} -> ${v.toLayer}: ${v.reason}`,
              severity: 'error',
            });
          }
        } else {
          statuses['check-deps'] = 'pass';
        }
      } else {
        statuses['check-deps'] = 'pass';
      }
    } catch (err) {
      statuses['check-deps'] = 'fail';
      findings.push({
        tool: 'check-deps',
        file: projectRoot,
        message: err instanceof Error ? err.message : String(err),
        severity: 'error',
      });
    }
  }

  // --- Phase 2: Parallel warning-only checks ---

  const parallelChecks: Array<Promise<void>> = [];

  // --- Check-docs ---
  if (!skip.includes('check-docs')) {
    parallelChecks.push(
      (async () => {
        try {
          const docsDir = path.join(projectRoot, (config.docsDir as string) ?? 'docs');
          const result = await checkDocCoverage('project', { docsDir });
          if (!result.ok) {
            statuses['check-docs'] = 'warn';
            findings.push({
              tool: 'check-docs',
              file: docsDir,
              message: result.error.message,
              severity: 'warning',
            });
          } else if (result.value.gaps && result.value.gaps.length > 0) {
            statuses['check-docs'] = 'warn';
            for (const gap of result.value.gaps) {
              findings.push({
                tool: 'check-docs',
                file: gap.file,
                message: `Undocumented: ${gap.file} (suggested: ${gap.suggestedSection})`,
                severity: 'warning',
              });
            }
          } else {
            statuses['check-docs'] = 'pass';
          }
        } catch (err) {
          statuses['check-docs'] = 'warn';
          findings.push({
            tool: 'check-docs',
            file: path.join(projectRoot, 'docs'),
            message: err instanceof Error ? err.message : String(err),
            severity: 'warning',
          });
        }
      })()
    );
  }

  // --- Security scan ---
  if (!skip.includes('security-scan')) {
    parallelChecks.push(
      (async () => {
        try {
          const securityConfig = parseSecurityConfig((config as Record<string, unknown>).security);
          if (!securityConfig.enabled) {
            statuses['security-scan'] = 'skip';
          } else {
            const scanner = new SecurityScanner(securityConfig);
            scanner.configureForProject(projectRoot);

            const filesToScan = changedFiles ?? [];
            const scanResult = await scanner.scanFiles(filesToScan);

            if (scanResult.findings.length > 0) {
              statuses['security-scan'] = 'warn';
              for (const f of scanResult.findings) {
                findings.push({
                  tool: 'security-scan',
                  file: f.file,
                  line: f.line,
                  ruleId: f.ruleId,
                  message: f.message,
                  severity: f.severity === 'info' ? 'warning' : f.severity,
                });
              }
            } else {
              statuses['security-scan'] = 'pass';
            }
          }
        } catch (err) {
          statuses['security-scan'] = 'warn';
          findings.push({
            tool: 'security-scan',
            file: projectRoot,
            message: err instanceof Error ? err.message : String(err),
            severity: 'warning',
          });
        }
      })()
    );
  }

  await Promise.all(parallelChecks);

  // Determine overall status
  const hasErrors = findings.some((f) => f.severity === 'error');
  // Pipeline stops only for validate and check-deps failures
  const stopPipeline = statuses.validate === 'fail' || statuses['check-deps'] === 'fail';

  return Ok({
    pass: !hasErrors,
    stopPipeline,
    findings,
    checks: {
      validate: statuses.validate,
      checkDeps: statuses['check-deps'],
      checkDocs: statuses['check-docs'],
      securityScan: statuses['security-scan'],
    },
  });
}
```

5. Run test: `cd packages/core && npx vitest run tests/review/mechanical-checks-parallel.test.ts`
6. Observe: all tests pass
7. Run existing mechanical-checks tests: `cd packages/core && npx vitest run tests/review/mechanical-checks.test.ts`
8. Run: `harness validate`
9. Commit: `perf(core): parallelize warning-only mechanical checks in review pipeline`

---

## Verification Checklist

After all 4 tasks complete:

1. Run full test suite: `npx turbo run test`
2. Run `harness validate`
3. Verify observable truths 1-9 are met
