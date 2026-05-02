# Plan: Intelligent Skill Dispatch -- Phase 2: Dispatch Engine Core

**Date:** 2026-04-06
**Spec:** docs/changes/intelligent-skill-dispatch/proposal.md
**Estimated tasks:** 7
**Estimated time:** 30 minutes

## Goal

Implement the dispatch engine that enriches health snapshots with change-type and domain signals from git diffs, feeds them into the existing recommendation engine, and annotates output with parallel-safe flags, estimated impact, and dependency info.

## Observable Truths (Acceptance Criteria)

1. When `detectDomainsFromFiles(['migrations/001.sql'])` is called, the system shall return `['database']`.
2. When `detectDomainsFromFiles(['k8s/deployment.yaml', '.env'])` is called, the system shall return `['containerization', 'secrets']` (sorted).
3. When `detectDomainsFromFiles(['src/index.ts'])` is called (no pattern match), the system shall return `[]`.
4. When `enrichSnapshotForDispatch()` is called with files and commitMessage, the system shall return a `DispatchContext` with `allSignals` containing snapshot signals + one change-type signal + domain signals.
5. When `dispatchSkills()` is called with a `DispatchContext` containing active signals, the system shall return a `DispatchResult` with annotated `DispatchedSkill[]`.
6. When a dispatched skill has a hard address match, `estimatedImpact` shall be `'high'`.
7. When a dispatched skill has score >= 0.7 and no hard match, `estimatedImpact` shall be `'medium'`.
8. When a dispatched skill has score < 0.7 and no hard match, `estimatedImpact` shall be `'low'`.
9. When two adjacent dispatched skills target signals in different categories (e.g., Structure vs Quality), `parallelSafe` shall be `true`.
10. When two adjacent dispatched skills target signals in the same category, `parallelSafe` shall be `false`.
11. When `buildDiffInfoFromGit()` is called in a git repo, the system shall construct a valid `DiffInfo` from `git diff --numstat` and `git diff --diff-filter=A`.
12. When git log fails (no commits), the system shall default `changeType` to `'feature'`.
13. When git diff fails or returns empty, the system shall return an empty dispatch result with `skills: []`.
14. If the directory is not a git repository, the system shall throw an error with message containing `"dispatch_skills requires a git repository"`.
15. `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts` passes with all tests green.
16. `harness validate` passes.

## File Map

```
MODIFY packages/cli/src/skill/stack-profile.ts          (add exported detectDomainsFromFiles function)
CREATE packages/cli/src/skill/dispatch-engine.ts         (enrichSnapshotForDispatch, dispatchSkills, git helpers, SIGNAL_CATEGORIES)
CREATE packages/cli/tests/skill/dispatch-engine.test.ts  (all unit tests)
```

## Tasks

### Task 1: Add `detectDomainsFromFiles()` to stack-profile.ts (TDD)

**Depends on:** none
**Files:** `packages/cli/tests/skill/dispatch-engine.test.ts`, `packages/cli/src/skill/stack-profile.ts`

1. Create test file `packages/cli/tests/skill/dispatch-engine.test.ts` with the first test group:

```typescript
import { describe, it, expect } from 'vitest';
import { detectDomainsFromFiles } from '../../src/skill/stack-profile';

describe('detectDomainsFromFiles', () => {
  it('returns empty array for empty file list', () => {
    expect(detectDomainsFromFiles([])).toEqual([]);
  });

  it('detects database domain from migrations descendant', () => {
    expect(detectDomainsFromFiles(['migrations/001.sql'])).toEqual(['database']);
  });

  it('detects containerization from Dockerfile exact match', () => {
    expect(detectDomainsFromFiles(['Dockerfile'])).toEqual(['containerization']);
  });

  it('detects secrets from .env exact match', () => {
    expect(detectDomainsFromFiles(['.env'])).toEqual(['secrets']);
  });

  it('detects multiple domains and returns sorted', () => {
    const result = detectDomainsFromFiles(['k8s/deployment.yaml', '.env']);
    expect(result).toEqual(['containerization', 'secrets']);
  });

  it('deduplicates domains from overlapping patterns', () => {
    const result = detectDomainsFromFiles(['docker-compose.yml', 'Dockerfile']);
    expect(result).toEqual(['containerization']);
  });

  it('returns empty for unrecognized paths', () => {
    expect(detectDomainsFromFiles(['src/index.ts', 'README.md'])).toEqual([]);
  });

  it('detects deployment from .github/workflows descendant', () => {
    const result = detectDomainsFromFiles(['.github/workflows/ci.yml']);
    expect(result).toEqual(['deployment']);
  });

  it('detects api-design from openapi.yaml exact match', () => {
    expect(detectDomainsFromFiles(['openapi.yaml'])).toEqual(['api-design']);
  });

  it('detects e2e from cypress descendant', () => {
    expect(detectDomainsFromFiles(['cypress/e2e/login.spec.ts'])).toEqual(['e2e']);
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
3. Observe failure: `detectDomainsFromFiles` is not exported from `stack-profile`.

4. Add to `packages/cli/src/skill/stack-profile.ts` -- after the closing brace of `SIGNAL_DOMAIN_MAP` (line 56) and before `generateStackProfile`:

```typescript
/**
 * Detect domains from a list of changed file paths by checking each path
 * against SIGNAL_DOMAIN_MAP keys. A file matches a pattern if the path
 * equals the pattern exactly or starts with `pattern/` (i.e., is a descendant).
 */
export function detectDomainsFromFiles(files: string[]): string[] {
  const domainSet = new Set<string>();

  for (const file of files) {
    for (const [pattern, domains] of Object.entries(SIGNAL_DOMAIN_MAP)) {
      if (file === pattern || file.startsWith(pattern + '/')) {
        for (const domain of domains) domainSet.add(domain);
      }
    }
  }

  return [...domainSet].sort();
}
```

5. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
6. Observe: all `detectDomainsFromFiles` tests pass.
7. Run: `cd packages/cli && npx vitest run tests/skill/stack-profile.test.ts` (existing tests still pass)
8. Run: `harness validate`
9. Commit: `feat(dispatch): add detectDomainsFromFiles to stack-profile`

---

### Task 2: Implement SIGNAL_CATEGORIES and parallel-safe detection (TDD)

**Depends on:** none
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import { SIGNAL_CATEGORIES, getSignalCategory } from '../../src/skill/dispatch-engine';

describe('SIGNAL_CATEGORIES', () => {
  it('maps structure signals correctly', () => {
    expect(getSignalCategory('circular-deps')).toBe('structure');
    expect(getSignalCategory('layer-violations')).toBe('structure');
    expect(getSignalCategory('high-coupling')).toBe('structure');
  });

  it('maps quality signals correctly', () => {
    expect(getSignalCategory('dead-code')).toBe('quality');
    expect(getSignalCategory('drift')).toBe('quality');
    expect(getSignalCategory('doc-gaps')).toBe('quality');
  });

  it('maps security signals', () => {
    expect(getSignalCategory('security-findings')).toBe('security');
  });

  it('maps performance signals', () => {
    expect(getSignalCategory('perf-regression')).toBe('performance');
  });

  it('maps coverage signals', () => {
    expect(getSignalCategory('low-coverage')).toBe('coverage');
  });

  it('returns null for change-type and domain signals', () => {
    expect(getSignalCategory('change-feature')).toBeNull();
    expect(getSignalCategory('domain-database')).toBeNull();
  });

  it('returns null for unknown signals', () => {
    expect(getSignalCategory('unknown-signal')).toBeNull();
  });
});
```

2. Run test -- observe failure: `dispatch-engine` module not found.

3. Create `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
/**
 * Dispatch engine core -- enriches health snapshots with change-type and domain
 * signals, feeds into the recommendation engine, and annotates output.
 */

import { execSync } from 'node:child_process';
import type { ChangeType, DiffInfo } from '@harness-engineering/core';
import { detectChangeType } from '@harness-engineering/core';
import type { HealthSnapshot } from './health-snapshot.js';
import { loadCachedSnapshot, isSnapshotFresh, captureHealthSnapshot } from './health-snapshot.js';
import { detectDomainsFromFiles } from './stack-profile.js';
import { recommend } from './recommendation-engine.js';
import type { SkillAddress } from './schema.js';
import type { Recommendation } from './recommendation-types.js';
import type { DispatchContext, DispatchResult, DispatchedSkill } from './dispatch-types.js';

// ---------------------------------------------------------------------------
// Signal categories for parallel-safe detection
// ---------------------------------------------------------------------------

export const SIGNAL_CATEGORIES: Record<string, string> = {
  'circular-deps': 'structure',
  'layer-violations': 'structure',
  'high-coupling': 'structure',
  'dead-code': 'quality',
  drift: 'quality',
  'doc-gaps': 'quality',
  'security-findings': 'security',
  'perf-regression': 'performance',
  'low-coverage': 'coverage',
};

/**
 * Get the parallel-safety category for a signal.
 * Returns null for change-type, domain, and unmapped signals.
 */
export function getSignalCategory(signal: string): string | null {
  return SIGNAL_CATEGORIES[signal] ?? null;
}
```

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: SIGNAL_CATEGORIES and getSignalCategory tests pass.
6. Run: `harness validate`
7. Commit: `feat(dispatch): add SIGNAL_CATEGORIES and getSignalCategory`

---

### Task 3: Implement git auto-detection helpers (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import {
  parseNumstatOutput,
  parseNewFilesOutput,
  buildDiffInfoFromGit,
  getLatestCommitMessage,
  getChangedFiles,
} from '../../src/skill/dispatch-engine';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

describe('parseNumstatOutput', () => {
  it('parses git diff --numstat output into total lines and file list', () => {
    const output = '10\t5\tsrc/a.ts\n3\t1\tsrc/b.ts\n';
    const result = parseNumstatOutput(output);
    expect(result.totalDiffLines).toBe(19); // 10+5+3+1
    expect(result.changedFiles).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('returns zero for empty output', () => {
    const result = parseNumstatOutput('');
    expect(result.totalDiffLines).toBe(0);
    expect(result.changedFiles).toEqual([]);
  });

  it('handles binary files (dash in numstat)', () => {
    const output = '-\t-\timage.png\n5\t2\tsrc/a.ts\n';
    const result = parseNumstatOutput(output);
    expect(result.totalDiffLines).toBe(7);
    expect(result.changedFiles).toEqual(['image.png', 'src/a.ts']);
  });
});

describe('parseNewFilesOutput', () => {
  it('parses git diff --diff-filter=A output into file list', () => {
    const output = 'src/new-file.ts\nsrc/another.ts\n';
    expect(parseNewFilesOutput(output)).toEqual(['src/new-file.ts', 'src/another.ts']);
  });

  it('returns empty for empty output', () => {
    expect(parseNewFilesOutput('')).toEqual([]);
  });
});

describe('git integration helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-git-test-'));
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getLatestCommitMessage', () => {
    it('returns commit message for repo with commits', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
      execSync('git add . && git commit -m "feat: initial commit"', { cwd: tmpDir, stdio: 'pipe' });
      expect(getLatestCommitMessage(tmpDir)).toBe('feat: initial commit');
    });

    it('returns empty string for repo with no commits', () => {
      expect(getLatestCommitMessage(tmpDir)).toBe('');
    });
  });

  describe('getChangedFiles', () => {
    it('returns changed file list from git diff --name-only HEAD', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'changed');
      const files = getChangedFiles(tmpDir);
      expect(files).toContain('a.txt');
    });

    it('returns empty array for repo with no commits', () => {
      expect(getChangedFiles(tmpDir)).toEqual([]);
    });
  });

  describe('buildDiffInfoFromGit', () => {
    it('constructs DiffInfo from git state', () => {
      fs.writeFileSync(path.join(tmpDir, 'existing.txt'), 'hello');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpDir, 'existing.txt'), 'changed content');
      fs.writeFileSync(path.join(tmpDir, 'new-file.txt'), 'new');
      execSync('git add .', { cwd: tmpDir, stdio: 'pipe' });
      const diff = buildDiffInfoFromGit(tmpDir);
      expect(diff.changedFiles.length).toBeGreaterThanOrEqual(1);
      expect(diff.newFiles).toContain('new-file.txt');
      expect(diff.totalDiffLines).toBeGreaterThan(0);
    });

    it('returns empty DiffInfo when no changes', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      const diff = buildDiffInfoFromGit(tmpDir);
      expect(diff.changedFiles).toEqual([]);
      expect(diff.newFiles).toEqual([]);
      expect(diff.totalDiffLines).toBe(0);
    });

    it('returns null for non-git directory', () => {
      const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-'));
      try {
        expect(buildDiffInfoFromGit(nonGit)).toBeNull();
      } finally {
        fs.rmSync(nonGit, { recursive: true, force: true });
      }
    });
  });
});
```

Note: add `import { beforeEach, afterEach }` to the existing vitest import at the top of the file.

2. Run test -- observe failures.

3. Append to `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Git output parsers
// ---------------------------------------------------------------------------

/**
 * Parse `git diff --numstat` output into total lines changed and file list.
 */
export function parseNumstatOutput(output: string): {
  totalDiffLines: number;
  changedFiles: string[];
} {
  const lines = output.trim().split('\n').filter(Boolean);
  let totalDiffLines = 0;
  const changedFiles: string[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [added, deleted, file] = parts;
    changedFiles.push(file);
    // Binary files show '-' for added/deleted
    if (added !== '-') totalDiffLines += parseInt(added, 10) || 0;
    if (deleted !== '-') totalDiffLines += parseInt(deleted, 10) || 0;
  }

  return { totalDiffLines, changedFiles };
}

/**
 * Parse `git diff --diff-filter=A --name-only` output into new file list.
 */
export function parseNewFilesOutput(output: string): string[] {
  return output.trim().split('\n').filter(Boolean);
}

// ---------------------------------------------------------------------------
// Git auto-detection helpers
// ---------------------------------------------------------------------------

/**
 * Get the latest commit message. Returns empty string if no commits exist.
 */
export function getLatestCommitMessage(projectPath: string): string {
  try {
    return execSync('git log -1 --format=%s', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Get changed files from `git diff --name-only HEAD`.
 * Returns empty array if no commits exist or diff fails.
 */
export function getChangedFiles(projectPath: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Build a DiffInfo object from current git state.
 * Uses `git diff --numstat` for line counts and `git diff --diff-filter=A --name-only` for new files.
 * Returns null if not in a git repository.
 */
export function buildDiffInfoFromGit(projectPath: string): DiffInfo | null {
  // Verify git repository
  try {
    execSync('git rev-parse --git-dir', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null;
  }

  try {
    const numstatOutput = execSync('git diff --numstat HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const newFilesOutput = execSync('git diff --diff-filter=A --name-only HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const { totalDiffLines, changedFiles } = parseNumstatOutput(numstatOutput);
    const newFiles = parseNewFilesOutput(newFilesOutput);
    const deletedFilesOutput = execSync('git diff --diff-filter=D --name-only HEAD', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const deletedFiles = parseNewFilesOutput(deletedFilesOutput);

    return {
      changedFiles,
      newFiles,
      deletedFiles,
      totalDiffLines,
      fileDiffs: new Map(),
    };
  } catch {
    // No commits or other git error -- return empty DiffInfo
    return {
      changedFiles: [],
      newFiles: [],
      deletedFiles: [],
      totalDiffLines: 0,
      fileDiffs: new Map(),
    };
  }
}
```

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: all git helper tests pass.
6. Run: `harness validate`
7. Commit: `feat(dispatch): add git auto-detection helpers and DiffInfo builder`

---

### Task 4: Implement `enrichSnapshotForDispatch()` (TDD)

**Depends on:** Task 1, Task 3
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import { enrichSnapshotForDispatch } from '../../src/skill/dispatch-engine';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
import type { DispatchContext } from '../../src/skill/dispatch-types';

// vi.mock must be at top-level -- add these mocks near top of file
import { vi } from 'vitest';

vi.mock('../../src/skill/health-snapshot', async () => {
  const actual = await vi.importActual<typeof import('../../src/skill/health-snapshot')>(
    '../../src/skill/health-snapshot'
  );
  return {
    ...actual,
    loadCachedSnapshot: vi.fn(),
    isSnapshotFresh: vi.fn(),
    captureHealthSnapshot: vi.fn(),
  };
});

// Import mocked modules after mock declaration
import {
  loadCachedSnapshot as mockLoadCachedSnapshot,
  isSnapshotFresh as mockIsSnapshotFresh,
  captureHealthSnapshot as mockCaptureHealthSnapshot,
} from '../../src/skill/health-snapshot';

const STUB_SNAPSHOT: HealthSnapshot = {
  capturedAt: '2026-04-06T00:00:00.000Z',
  gitHead: 'abc123',
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
    avgFanOut: 0,
    maxFanOut: 0,
    avgCyclomaticComplexity: 0,
    maxCyclomaticComplexity: 0,
    avgCouplingRatio: 0,
    testCoverage: null,
    anomalyOutlierCount: 0,
    articulationPointCount: 0,
  },
  signals: ['circular-deps', 'dead-code'],
};

describe('enrichSnapshotForDispatch', () => {
  beforeEach(() => {
    vi.mocked(mockLoadCachedSnapshot).mockReturnValue(STUB_SNAPSHOT);
    vi.mocked(mockIsSnapshotFresh).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns DispatchContext with merged allSignals', async () => {
    const ctx = await enrichSnapshotForDispatch('/tmp/test', {
      files: ['migrations/001.sql'],
      commitMessage: 'feat: add migration',
    });
    expect(ctx.changeType).toBe('feature');
    expect(ctx.domains).toContain('database');
    expect(ctx.allSignals).toContain('circular-deps');
    expect(ctx.allSignals).toContain('dead-code');
    expect(ctx.allSignals).toContain('change-feature');
    expect(ctx.allSignals).toContain('domain-database');
  });

  it('defaults changeType to feature when commitMessage is empty', async () => {
    const ctx = await enrichSnapshotForDispatch('/tmp/test', {
      files: ['src/index.ts'],
      commitMessage: '',
    });
    expect(ctx.changeType).toBe('feature');
  });

  it('uses cached snapshot when fresh', async () => {
    await enrichSnapshotForDispatch('/tmp/test', {
      files: [],
      commitMessage: 'fix: bug',
    });
    expect(mockCaptureHealthSnapshot).not.toHaveBeenCalled();
  });

  it('captures fresh snapshot when fresh option is true', async () => {
    vi.mocked(mockCaptureHealthSnapshot).mockResolvedValue(STUB_SNAPSHOT);
    await enrichSnapshotForDispatch('/tmp/test', {
      files: [],
      commitMessage: 'fix: bug',
      fresh: true,
    });
    expect(mockCaptureHealthSnapshot).toHaveBeenCalledWith('/tmp/test');
  });

  it('captures fresh snapshot when cached snapshot is stale', async () => {
    vi.mocked(mockIsSnapshotFresh).mockReturnValue(false);
    vi.mocked(mockCaptureHealthSnapshot).mockResolvedValue(STUB_SNAPSHOT);
    await enrichSnapshotForDispatch('/tmp/test', {
      files: [],
      commitMessage: 'refactor: cleanup',
    });
    expect(mockCaptureHealthSnapshot).toHaveBeenCalled();
  });

  it('captures fresh snapshot when no cached snapshot exists', async () => {
    vi.mocked(mockLoadCachedSnapshot).mockReturnValue(null);
    vi.mocked(mockCaptureHealthSnapshot).mockResolvedValue(STUB_SNAPSHOT);
    await enrichSnapshotForDispatch('/tmp/test', {
      files: [],
      commitMessage: 'docs: update readme',
    });
    expect(mockCaptureHealthSnapshot).toHaveBeenCalled();
  });

  it('derives bugfix changeType from commit prefix', async () => {
    const ctx = await enrichSnapshotForDispatch('/tmp/test', {
      files: [],
      commitMessage: 'fix: resolve null pointer',
    });
    expect(ctx.changeType).toBe('bugfix');
    expect(ctx.allSignals).toContain('change-bugfix');
  });
});
```

**Important structural note:** Because vi.mock calls need to be at module scope, the actual test file will need careful ordering. The vi.mock calls go after the initial imports but before the test suites that use mocked modules. The tests from Tasks 1-3 that do NOT need mocking should remain as-is. This task restructures the file so that:

- Pure function tests (detectDomainsFromFiles, SIGNAL_CATEGORIES, parsers, git integration) come first and do not use mocks.
- Mock-dependent tests (enrichSnapshotForDispatch, dispatchSkills) come after the vi.mock declarations.

The executor should create the file in the right order, placing `vi.mock` declarations before the `describe('enrichSnapshotForDispatch', ...)` block.

2. Run test -- observe failure.

3. Append to `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Enriched snapshot for dispatch
// ---------------------------------------------------------------------------

/**
 * Build an enriched DispatchContext by combining a health snapshot with
 * change-type and domain signals derived from git diff information.
 */
export async function enrichSnapshotForDispatch(
  projectPath: string,
  options: { files?: string[]; commitMessage?: string; fresh?: boolean }
): Promise<DispatchContext> {
  // 1. Get snapshot (cached or fresh)
  let snapshot: HealthSnapshot | null = null;
  let freshness: 'fresh' | 'cached' = 'cached';

  if (!options.fresh) {
    snapshot = loadCachedSnapshot(projectPath);
    if (snapshot && !isSnapshotFresh(snapshot, projectPath)) {
      snapshot = null; // stale, will recapture
    }
  }

  if (!snapshot) {
    snapshot = await captureHealthSnapshot(projectPath);
    freshness = 'fresh';
  }

  // 2. Detect change type
  const commitMessage = options.commitMessage ?? '';
  const files = options.files ?? [];
  const diff: DiffInfo = {
    changedFiles: files,
    newFiles: [],
    deletedFiles: [],
    totalDiffLines: 0,
    fileDiffs: new Map(),
  };
  const changeType: ChangeType = detectChangeType(commitMessage, diff);

  // 3. Detect domains from changed files
  const domains = detectDomainsFromFiles(files);

  // 4. Merge all signals
  const changeSignal = `change-${changeType}`;
  const domainSignals = domains.map((d) => `domain-${d}`);
  const allSignals = [...snapshot.signals, changeSignal, ...domainSignals];

  return {
    snapshot,
    changeType,
    changedFiles: files,
    domains,
    allSignals,
  };
}
```

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: enrichSnapshotForDispatch tests pass.
6. Run: `harness validate`
7. Commit: `feat(dispatch): implement enrichSnapshotForDispatch`

---

### Task 5: Implement annotation helpers (`estimatedImpact`, `parallelSafe`) (TDD)

**Depends on:** Task 2
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import { computeEstimatedImpact, computeParallelSafe } from '../../src/skill/dispatch-engine';
import type { Recommendation } from '../../src/skill/recommendation-types';

describe('computeEstimatedImpact', () => {
  it('returns high when recommendation urgency is critical (hard address match)', () => {
    expect(computeEstimatedImpact({ urgency: 'critical', score: 1.0 } as Recommendation)).toBe(
      'high'
    );
  });

  it('returns medium when score >= 0.7 and not critical', () => {
    expect(computeEstimatedImpact({ urgency: 'recommended', score: 0.7 } as Recommendation)).toBe(
      'medium'
    );
    expect(computeEstimatedImpact({ urgency: 'recommended', score: 0.85 } as Recommendation)).toBe(
      'medium'
    );
  });

  it('returns low when score < 0.7 and not critical', () => {
    expect(computeEstimatedImpact({ urgency: 'nice-to-have', score: 0.5 } as Recommendation)).toBe(
      'low'
    );
    expect(computeEstimatedImpact({ urgency: 'recommended', score: 0.69 } as Recommendation)).toBe(
      'low'
    );
  });
});

describe('computeParallelSafe', () => {
  it('returns true for adjacent skills in different categories', () => {
    const prev = ['circular-deps']; // structure
    const curr = ['dead-code']; // quality
    expect(computeParallelSafe(prev, curr)).toBe(true);
  });

  it('returns false for adjacent skills in same category', () => {
    const prev = ['circular-deps']; // structure
    const curr = ['layer-violations']; // structure
    expect(computeParallelSafe(prev, curr)).toBe(false);
  });

  it('returns true when previous skill has no signals (first in sequence)', () => {
    expect(computeParallelSafe([], ['dead-code'])).toBe(true);
  });

  it('returns false when category cannot be determined', () => {
    const prev = ['change-feature']; // null category
    const curr = ['change-bugfix']; // null category
    expect(computeParallelSafe(prev, curr)).toBe(false);
  });

  it('handles mixed signals -- overlap in any category means not safe', () => {
    const prev = ['circular-deps', 'dead-code']; // structure, quality
    const curr = ['high-coupling']; // structure -- overlaps
    expect(computeParallelSafe(prev, curr)).toBe(false);
  });

  it('returns true when no category overlap in multi-signal skills', () => {
    const prev = ['circular-deps']; // structure
    const curr = ['dead-code', 'low-coverage']; // quality, coverage
    expect(computeParallelSafe(prev, curr)).toBe(true);
  });
});
```

2. Run test -- observe failure.

3. Append to `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Annotation helpers
// ---------------------------------------------------------------------------

/**
 * Compute estimatedImpact from a recommendation.
 * hard address match (critical urgency) -> high, score >= 0.7 -> medium, else low.
 */
export function computeEstimatedImpact(rec: Recommendation): 'high' | 'medium' | 'low' {
  if (rec.urgency === 'critical') return 'high';
  if (rec.score >= 0.7) return 'medium';
  return 'low';
}

/**
 * Compute whether two adjacent skills are parallel-safe based on their triggered signals.
 * Skills are parallel-safe when they target non-overlapping signal categories.
 * Default to false if category cannot be determined.
 */
export function computeParallelSafe(prevTriggeredBy: string[], currTriggeredBy: string[]): boolean {
  if (prevTriggeredBy.length === 0) return true;

  const prevCategories = new Set<string>();
  const currCategories = new Set<string>();

  let prevHasCategory = false;
  let currHasCategory = false;

  for (const sig of prevTriggeredBy) {
    const cat = getSignalCategory(sig);
    if (cat) {
      prevCategories.add(cat);
      prevHasCategory = true;
    }
  }

  for (const sig of currTriggeredBy) {
    const cat = getSignalCategory(sig);
    if (cat) {
      currCategories.add(cat);
      currHasCategory = true;
    }
  }

  // If either skill has no categorizable signals, default to not parallel-safe
  if (!prevHasCategory || !currHasCategory) return false;

  // Check for overlap
  for (const cat of currCategories) {
    if (prevCategories.has(cat)) return false;
  }

  return true;
}
```

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: annotation helper tests pass.
6. Run: `harness validate`
7. Commit: `feat(dispatch): implement estimatedImpact and parallelSafe annotation helpers`

---

### Task 6: Implement `dispatchSkills()` (TDD)

**Depends on:** Task 4, Task 5
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import { dispatchSkills } from '../../src/skill/dispatch-engine';
import type { DispatchContext } from '../../src/skill/dispatch-types';

describe('dispatchSkills', () => {
  const baseContext: DispatchContext = {
    snapshot: STUB_SNAPSHOT,
    changeType: 'bugfix',
    changedFiles: ['src/index.ts'],
    domains: [],
    allSignals: ['low-coverage', 'change-bugfix'],
  };

  it('returns DispatchResult with annotated skills', () => {
    const result = dispatchSkills(baseContext);
    expect(result.context.changeType).toBe('bugfix');
    expect(result.context.signalCount).toBe(2);
    expect(result.generatedAt).toBeTruthy();
    expect(Array.isArray(result.skills)).toBe(true);
  });

  it('returns skills with estimatedImpact annotations', () => {
    // circular-deps triggers hard rule on enforce-architecture -> high impact
    const ctx: DispatchContext = {
      ...baseContext,
      allSignals: ['circular-deps', 'change-bugfix'],
    };
    const result = dispatchSkills(ctx);
    const enforceArch = result.skills.find((s) => s.name === 'enforce-architecture');
    if (enforceArch) {
      expect(enforceArch.estimatedImpact).toBe('high');
    }
  });

  it('returns skills with parallelSafe annotations', () => {
    // circular-deps (structure) + dead-code (quality) -> different categories
    const ctx: DispatchContext = {
      ...baseContext,
      allSignals: ['circular-deps', 'dead-code', 'change-feature'],
    };
    const result = dispatchSkills(ctx);
    expect(result.skills.length).toBeGreaterThan(0);
    // Each skill should have a boolean parallelSafe field
    for (const skill of result.skills) {
      expect(typeof skill.parallelSafe).toBe('boolean');
    }
  });

  it('returns skills with dependsOn from skill index', () => {
    const result = dispatchSkills(baseContext);
    for (const skill of result.skills) {
      // dependsOn should be undefined or an array
      if (skill.dependsOn !== undefined) {
        expect(Array.isArray(skill.dependsOn)).toBe(true);
      }
    }
  });

  it('returns empty skills for empty signals', () => {
    const ctx: DispatchContext = {
      ...baseContext,
      allSignals: [],
    };
    const result = dispatchSkills(ctx);
    expect(result.skills).toEqual([]);
  });

  it('includes domains in context', () => {
    const ctx: DispatchContext = {
      ...baseContext,
      domains: ['database', 'secrets'],
      allSignals: ['domain-database', 'domain-secrets', 'change-feature'],
    };
    const result = dispatchSkills(ctx);
    expect(result.context.domains).toEqual(['database', 'secrets']);
  });

  it('populates snapshotFreshness based on cached snapshot', () => {
    const result = dispatchSkills(baseContext);
    expect(['fresh', 'cached']).toContain(result.context.snapshotFreshness);
  });
});
```

2. Run test -- observe failure.

3. Append to `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

/**
 * Run the dispatch engine: feed enriched signals into the recommendation engine,
 * then annotate output with parallel-safe flags, estimatedImpact, and dependsOn.
 */
export function dispatchSkills(
  context: DispatchContext,
  options: { limit?: number } = {}
): DispatchResult {
  const { snapshot, changeType, domains, allSignals } = context;
  const limit = options.limit ?? 5;

  // Build an enriched snapshot with all signals for the recommendation engine
  const enrichedSnapshot: HealthSnapshot = {
    ...snapshot,
    signals: allSignals,
  };

  // Run recommendation engine (uses fallback rules -- no skill index files needed)
  const recResult = recommend(enrichedSnapshot, {}, { top: limit });

  // Build the skill address index to get dependsOn info
  const { buildSkillAddressIndex } = require('./recommendation-engine.js');
  const addressIndex = buildSkillAddressIndex({});

  // Annotate recommendations into DispatchedSkill[]
  const skills: DispatchedSkill[] = [];
  for (let i = 0; i < recResult.recommendations.length; i++) {
    const rec = recResult.recommendations[i];
    const prevRec = i > 0 ? recResult.recommendations[i - 1] : null;

    const prevTriggeredBy = prevRec?.triggeredBy ?? [];
    const currTriggeredBy = rec.triggeredBy;

    const entry = addressIndex.get(rec.skillName);
    const dependsOn = entry?.dependsOn?.length ? entry.dependsOn : undefined;

    skills.push({
      name: rec.skillName,
      score: rec.score,
      urgency: rec.urgency,
      reason: rec.reasons.join('; '),
      parallelSafe: computeParallelSafe(prevTriggeredBy, currTriggeredBy),
      estimatedImpact: computeEstimatedImpact(rec),
      dependsOn,
    });
  }

  // Determine snapshot freshness
  const snapshotFreshness: 'fresh' | 'cached' =
    snapshot.capturedAt === enrichedSnapshot.capturedAt ? 'cached' : 'fresh';

  return {
    context: {
      changeType,
      domains,
      signalCount: allSignals.length,
      snapshotFreshness,
    },
    skills,
    generatedAt: new Date().toISOString(),
  };
}
```

**Note to executor:** The `require()` call above is a placeholder pattern. The actual implementation should import `buildSkillAddressIndex` from the static import at the top of the file. Since `buildSkillAddressIndex` is already importable from `./recommendation-engine.js`, update the import statement at the top of dispatch-engine.ts to include it:

```typescript
import { recommend, buildSkillAddressIndex } from './recommendation-engine.js';
```

And replace the `require()` line with just using `buildSkillAddressIndex` directly.

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: dispatchSkills tests pass.
6. Run: `harness validate`
7. Commit: `feat(dispatch): implement dispatchSkills with annotation pipeline`

---

### Task 7: Error handling and integration test (TDD)

**Depends on:** Task 6, Task 3
**Files:** `packages/cli/src/skill/dispatch-engine.ts`, `packages/cli/tests/skill/dispatch-engine.test.ts`

[checkpoint:human-verify] -- Verify all prior tasks pass before running the integration error-handling tests.

1. Append to `packages/cli/tests/skill/dispatch-engine.test.ts`:

```typescript
import { dispatchSkillsFromGit } from '../../src/skill/dispatch-engine';

describe('dispatchSkillsFromGit', () => {
  it('throws error for non-git directory', async () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'non-git-dispatch-'));
    try {
      await expect(dispatchSkillsFromGit(nonGit)).rejects.toThrow(
        'dispatch_skills requires a git repository'
      );
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }
  });

  it('returns empty skills when diff is empty', async () => {
    const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-empty-'));
    try {
      execSync('git init', { cwd: tmpDir2, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir2, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir2, stdio: 'pipe' });
      fs.writeFileSync(path.join(tmpDir2, 'a.txt'), 'hello');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir2, stdio: 'pipe' });
      // No changes -> empty diff
      const result = await dispatchSkillsFromGit(tmpDir2);
      expect(result.skills).toEqual([]);
    } finally {
      fs.rmSync(tmpDir2, { recursive: true, force: true });
    }
  });

  it('defaults changeType to feature when no commits exist', async () => {
    const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-nocommit-'));
    try {
      execSync('git init', { cwd: tmpDir3, stdio: 'pipe' });
      // No commits -> getLatestCommitMessage returns empty -> default feature
      const result = await dispatchSkillsFromGit(tmpDir3);
      expect(result.skills).toEqual([]);
      expect(result.context.changeType).toBe('feature');
    } finally {
      fs.rmSync(tmpDir3, { recursive: true, force: true });
    }
  });
});
```

2. Run test -- observe failure.

3. Append to `packages/cli/src/skill/dispatch-engine.ts`:

```typescript
// ---------------------------------------------------------------------------
// High-level dispatch from git state
// ---------------------------------------------------------------------------

/**
 * Full dispatch pipeline: auto-detect from git, enrich, and dispatch.
 * Throws if not in a git repository.
 * Returns empty skills if diff is empty.
 */
export async function dispatchSkillsFromGit(
  projectPath: string,
  options: { fresh?: boolean; limit?: number } = {}
): Promise<DispatchResult> {
  // Check for git repository
  const diffInfo = buildDiffInfoFromGit(projectPath);
  if (diffInfo === null) {
    throw new Error('dispatch_skills requires a git repository');
  }

  // Empty diff -> empty result
  if (diffInfo.changedFiles.length === 0) {
    const commitMessage = getLatestCommitMessage(projectPath);
    const changeType: ChangeType = commitMessage
      ? detectChangeType(commitMessage, diffInfo)
      : 'feature';

    return {
      context: {
        changeType,
        domains: [],
        signalCount: 0,
        snapshotFreshness: 'cached',
      },
      skills: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // Auto-detect commit message and files
  const commitMessage = getLatestCommitMessage(projectPath);
  const files = diffInfo.changedFiles;

  // Enrich and dispatch
  const ctx = await enrichSnapshotForDispatch(projectPath, {
    files,
    commitMessage: commitMessage || undefined,
    fresh: options.fresh,
  });

  return dispatchSkills(ctx, { limit: options.limit });
}
```

4. Run test: `cd packages/cli && npx vitest run tests/skill/dispatch-engine.test.ts`
5. Observe: all tests pass.
6. Run all existing skill tests to verify no regressions: `cd packages/cli && npx vitest run tests/skill/`
7. Run: `harness validate`
8. Commit: `feat(dispatch): add dispatchSkillsFromGit with error handling`

---

## Traceability

| Observable Truth                                                                              | Delivered by Task |
| --------------------------------------------------------------------------------------------- | ----------------- |
| 1. detectDomainsFromFiles(['migrations/001.sql']) -> ['database']                             | Task 1            |
| 2. detectDomainsFromFiles(['k8s/deployment.yaml', '.env']) -> ['containerization', 'secrets'] | Task 1            |
| 3. detectDomainsFromFiles(['src/index.ts']) -> []                                             | Task 1            |
| 4. enrichSnapshotForDispatch returns DispatchContext with merged allSignals                   | Task 4            |
| 5. dispatchSkills returns DispatchResult with DispatchedSkill[]                               | Task 6            |
| 6. hard address match -> estimatedImpact 'high'                                               | Task 5, Task 6    |
| 7. score >= 0.7 -> estimatedImpact 'medium'                                                   | Task 5, Task 6    |
| 8. score < 0.7 -> estimatedImpact 'low'                                                       | Task 5, Task 6    |
| 9. different categories -> parallelSafe true                                                  | Task 5, Task 6    |
| 10. same category -> parallelSafe false                                                       | Task 5, Task 6    |
| 11. buildDiffInfoFromGit constructs DiffInfo                                                  | Task 3            |
| 12. no commits -> changeType defaults to 'feature'                                            | Task 7            |
| 13. empty diff -> skills: []                                                                  | Task 7            |
| 14. non-git directory -> error                                                                | Task 7            |
| 15. All tests pass                                                                            | Task 7            |
| 16. harness validate passes                                                                   | All tasks         |
