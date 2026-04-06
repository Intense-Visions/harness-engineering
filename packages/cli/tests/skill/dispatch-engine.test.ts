import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { detectDomainsFromFiles } from '../../src/skill/stack-profile';
import {
  SIGNAL_CATEGORIES,
  getSignalCategory,
  parseNumstatOutput,
  parseNewFilesOutput,
  buildDiffInfoFromGit,
  getLatestCommitMessage,
  getChangedFiles,
  enrichSnapshotForDispatch,
  computeEstimatedImpact,
  computeParallelSafe,
  dispatchSkills,
  dispatchSkillsFromGit,
} from '../../src/skill/dispatch-engine';
import type { Recommendation } from '../../src/skill/recommendation-types';
import type { HealthSnapshot } from '../../src/skill/health-snapshot';
import type { DispatchContext } from '../../src/skill/dispatch-types';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';

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

// ============================================================================
// Pure function tests (no mocks needed)
// ============================================================================

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
      expect(diff!.changedFiles.length).toBeGreaterThanOrEqual(1);
      expect(diff!.newFiles).toContain('new-file.txt');
      expect(diff!.totalDiffLines).toBeGreaterThan(0);
    });

    it('returns empty DiffInfo when no changes', () => {
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'hello');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'pipe' });
      const diff = buildDiffInfoFromGit(tmpDir);
      expect(diff!.changedFiles).toEqual([]);
      expect(diff!.newFiles).toEqual([]);
      expect(diff!.totalDiffLines).toBe(0);
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

// ============================================================================
// Mock-dependent tests
// ============================================================================

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

describe('dispatchSkills', () => {
  const baseContext: DispatchContext = {
    snapshot: STUB_SNAPSHOT,
    changeType: 'bugfix',
    changedFiles: ['src/index.ts'],
    domains: [],
    allSignals: ['low-coverage', 'change-bugfix'],
    snapshotFreshness: 'cached',
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
