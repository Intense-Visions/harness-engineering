import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SecurityTimelineManager } from '../../src/security/security-timeline-manager';
import { securityFindingId, EMPTY_SUPPLY_CHAIN } from '../../src/security/security-timeline-types';
import type { ScanResult, SecurityFinding } from '../../src/security/types';
import type { SecurityTimelineFile } from '../../src/security/security-timeline-types';

function tmpDir(): string {
  return path.join(__dirname, '__test-tmp-sec-timeline__');
}

function timelinePath(root: string): string {
  return path.join(root, '.harness', 'security', 'timeline.json');
}

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    ruleId: 'SEC-INJ-001',
    ruleName: 'eval injection',
    category: 'injection',
    severity: 'error',
    confidence: 'high',
    file: 'src/util.ts',
    line: 10,
    match: 'eval(input)',
    context: 'eval(input)',
    message: 'Dangerous eval',
    remediation: 'Avoid eval',
    ...overrides,
  };
}

function makeScanResult(findings: SecurityFinding[]): ScanResult {
  return {
    findings,
    scannedFiles: 10,
    rulesApplied: 5,
    externalToolsUsed: [],
    coverage: 'baseline',
  };
}

describe('SecurityTimelineManager', () => {
  let root: string;
  let manager: SecurityTimelineManager;

  beforeEach(() => {
    root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    manager = new SecurityTimelineManager(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  // --- load() ---

  describe('load()', () => {
    it('returns empty SecurityTimelineFile when file does not exist', () => {
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [], findingLifecycles: [] });
    });

    it('returns empty SecurityTimelineFile when file is invalid JSON', () => {
      const p = timelinePath(root);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, 'not json');
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [], findingLifecycles: [] });
    });

    it('returns parsed file when valid', () => {
      const p = timelinePath(root);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const file: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [],
      };
      fs.writeFileSync(p, JSON.stringify(file));
      const result = manager.load();
      expect(result).toEqual(file);
    });
  });

  // --- capture() ---

  describe('capture()', () => {
    it('appends a snapshot with correct counts', () => {
      const findings = [
        makeFinding({ severity: 'error', category: 'injection' }),
        makeFinding({
          severity: 'warning',
          category: 'secrets',
          ruleId: 'SEC-SEC-001',
          match: 'key=abc',
        }),
        makeFinding({
          severity: 'info',
          category: 'xss',
          ruleId: 'SEC-XSS-001',
          match: '<script>',
        }),
      ];
      const result = makeScanResult(findings);

      const snapshot = manager.capture(result, 'abc123');

      expect(snapshot.totalFindings).toBe(3);
      expect(snapshot.bySeverity).toEqual({ error: 1, warning: 1, info: 1 });
      expect(snapshot.byCategory['injection']?.findingCount).toBe(1);
      expect(snapshot.byCategory['injection']?.errorCount).toBe(1);
      expect(snapshot.byCategory['secrets']?.findingCount).toBe(1);
      expect(snapshot.byCategory['secrets']?.warningCount).toBe(1);
      expect(snapshot.commitHash).toBe('abc123');
      expect(snapshot.findingIds).toHaveLength(3);

      // Verify persisted
      const timeline = manager.load();
      expect(timeline.snapshots).toHaveLength(1);
      expect(timeline.snapshots[0]!.commitHash).toBe('abc123');
    });

    it('deduplicates same commitHash', () => {
      const r1 = makeScanResult([makeFinding()]);
      const r2 = makeScanResult([
        makeFinding(),
        makeFinding({ ruleId: 'SEC-XSS-001', match: 'xss' }),
      ]);

      manager.capture(r1, 'same-hash');
      manager.capture(r2, 'same-hash');

      const timeline = manager.load();
      expect(timeline.snapshots).toHaveLength(1);
      expect(timeline.snapshots[0]!.totalFindings).toBe(2);
    });

    it('appends different commitHashes', () => {
      manager.capture(makeScanResult([]), 'hash1');
      manager.capture(makeScanResult([]), 'hash2');

      const timeline = manager.load();
      expect(timeline.snapshots).toHaveLength(2);
    });
  });

  // --- computeSecurityScore() ---

  describe('computeSecurityScore()', () => {
    it('returns 100 for zero findings', () => {
      const snapshot = manager.capture(makeScanResult([]), 'clean');
      expect(snapshot.securityScore).toBe(100);
    });

    it('returns weighted penalty score', () => {
      // 2 errors (2*3=6), 1 warning (1*1=1), 4 infos (4*0.25=1) = penalty 8 → score 92
      const findings = [
        makeFinding({ severity: 'error', ruleId: 'r1', match: 'm1' }),
        makeFinding({ severity: 'error', ruleId: 'r2', match: 'm2' }),
        makeFinding({ severity: 'warning', ruleId: 'r3', match: 'm3' }),
        makeFinding({ severity: 'info', ruleId: 'r4', match: 'm4' }),
        makeFinding({ severity: 'info', ruleId: 'r5', match: 'm5' }),
        makeFinding({ severity: 'info', ruleId: 'r6', match: 'm6' }),
        makeFinding({ severity: 'info', ruleId: 'r7', match: 'm7' }),
      ];
      const snapshot = manager.capture(makeScanResult(findings), 'scored');
      expect(snapshot.securityScore).toBe(92);
    });

    it('includes supply chain penalties', () => {
      const supply = { critical: 1, high: 1, moderate: 1, low: 0, info: 0, total: 3 };
      // supply penalty: 1*5 + 1*3 + 1*1 = 9 → score 91
      const snapshot = manager.capture(makeScanResult([]), 'supply', supply);
      expect(snapshot.securityScore).toBe(91);
    });

    it('clamps score to 0 for extreme findings', () => {
      // 50 errors = 150 penalty → score 0
      const findings = Array.from({ length: 50 }, (_, i) =>
        makeFinding({ severity: 'error', ruleId: `r${i}`, match: `m${i}` })
      );
      const snapshot = manager.capture(makeScanResult(findings), 'bad');
      expect(snapshot.securityScore).toBe(0);
    });
  });

  // --- captureSupplyChain() ---

  describe('captureSupplyChain()', () => {
    it('returns zeroed snapshot when npm audit fails', () => {
      // Use a non-existent directory to trigger failure
      const badManager = new SecurityTimelineManager('/tmp/nonexistent-dir-sec-timeline');
      const result = badManager.captureSupplyChain('/tmp/nonexistent-dir-sec-timeline');
      expect(result).toEqual(EMPTY_SUPPLY_CHAIN);
    });
  });

  // --- updateLifecycles() ---

  describe('updateLifecycles()', () => {
    it('adds new findings with firstSeenAt', () => {
      const findings = [makeFinding()];
      manager.updateLifecycles(findings, 'commit1');

      const timeline = manager.load();
      expect(timeline.findingLifecycles).toHaveLength(1);
      expect(timeline.findingLifecycles[0]!.ruleId).toBe('SEC-INJ-001');
      expect(timeline.findingLifecycles[0]!.firstSeenCommit).toBe('commit1');
      expect(timeline.findingLifecycles[0]!.resolvedAt).toBeNull();
    });

    it('marks resolved findings with resolvedAt', () => {
      const findings = [makeFinding()];
      manager.updateLifecycles(findings, 'commit1');

      // Second update with no findings — the finding is resolved
      manager.updateLifecycles([], 'commit2');

      const timeline = manager.load();
      expect(timeline.findingLifecycles).toHaveLength(1);
      expect(timeline.findingLifecycles[0]!.resolvedAt).not.toBeNull();
      expect(timeline.findingLifecycles[0]!.resolvedCommit).toBe('commit2');
    });

    it('reopens resolved findings if they reappear', () => {
      const findings = [makeFinding()];
      manager.updateLifecycles(findings, 'commit1');
      manager.updateLifecycles([], 'commit2');
      manager.updateLifecycles(findings, 'commit3');

      const timeline = manager.load();
      expect(timeline.findingLifecycles[0]!.resolvedAt).toBeNull();
      expect(timeline.findingLifecycles[0]!.resolvedCommit).toBeNull();
    });
  });

  // Issue #270: timeline.json must be share-safe across machines. The scanner globs
  // with absolute paths, but the persisted lifecycle entries should always be repo-
  // relative so committing the file does not leak `/Users/<dev>/...` and does not
  // produce path-based merge conflicts when different developers scan.
  describe('path normalization (issue #270)', () => {
    it('updateLifecycles stores repo-relative paths even when scanner emits absolute', () => {
      const absFile = path.join(root, 'src', 'util.ts');
      manager.updateLifecycles([makeFinding({ file: absFile })], 'commit-abs');

      const timeline = manager.load();
      expect(timeline.findingLifecycles).toHaveLength(1);
      expect(timeline.findingLifecycles[0]!.file).toBe('src/util.ts');
    });

    it('keeps already-relative paths intact (no double-strip)', () => {
      manager.updateLifecycles([makeFinding({ file: 'src/util.ts' })], 'commit-rel');

      const timeline = manager.load();
      expect(timeline.findingLifecycles[0]!.file).toBe('src/util.ts');
    });

    it('produces rootDir-independent finding IDs (so two clones agree)', () => {
      const otherRoot = path.join(__dirname, '__test-tmp-sec-timeline-other__');
      fs.mkdirSync(otherRoot, { recursive: true });
      try {
        const otherManager = new SecurityTimelineManager(otherRoot);

        manager.updateLifecycles([makeFinding({ file: path.join(root, 'src', 'util.ts') })], 'c1');
        otherManager.updateLifecycles(
          [makeFinding({ file: path.join(otherRoot, 'src', 'util.ts') })],
          'c1'
        );

        const id1 = manager.load().findingLifecycles[0]!.findingId;
        const id2 = otherManager.load().findingLifecycles[0]!.findingId;
        expect(id1).toBe(id2);
      } finally {
        fs.rmSync(otherRoot, { recursive: true, force: true });
      }
    });

    it('leaves paths outside rootDir unchanged (never silently misattributes)', () => {
      // A scanner could in theory emit a path outside the project (symlinked vendor
      // dir, etc.). We must not strip it to an empty/wrong relative path.
      const outsidePath = path.resolve(root, '..', '__outside__', 'leaked.ts');
      manager.updateLifecycles([makeFinding({ file: outsidePath })], 'c1');

      const timeline = manager.load();
      expect(timeline.findingLifecycles[0]!.file).toBe(outsidePath);
    });

    it('migrates legacy absolute paths under rootDir on load() and re-saves', () => {
      // Simulate a timeline.json written by an older version that persisted whatever
      // path the scanner emitted (absolute under rootDir).
      const legacy: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'legacy-id',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: path.join(root, 'src', 'util.ts'),
            firstSeenAt: new Date().toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: null,
            resolvedCommit: null,
          },
        ],
      };
      const p = timelinePath(root);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(legacy));

      const loaded = manager.load();
      expect(loaded.findingLifecycles[0]!.file).toBe('src/util.ts');

      // Re-saved on first load, so re-reading the file directly shows the migrated form.
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf-8')) as SecurityTimelineFile;
      expect(onDisk.findingLifecycles[0]!.file).toBe('src/util.ts');
    });

    it('load() is a no-op when paths are already relative (does not touch mtime)', () => {
      const clean: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'id1',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: 'src/util.ts',
            firstSeenAt: new Date().toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: null,
            resolvedCommit: null,
          },
        ],
      };
      const p = timelinePath(root);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(clean));
      const mtimeBefore = fs.statSync(p).mtimeMs;

      manager.load();
      const mtimeAfter = fs.statSync(p).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
    });
  });

  // --- computeTimeToFix() ---

  describe('computeTimeToFix()', () => {
    it('returns zero stats when no resolved findings', () => {
      const result = manager.computeTimeToFix();
      expect(result.overall).toEqual({ mean: 0, median: 0, count: 0 });
      expect(result.openFindings).toBe(0);
      expect(result.oldestOpenDays).toBeNull();
    });

    it('computes correct mean/median for resolved findings', () => {
      // Manually write lifecycle data with known timestamps
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'f1',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: 'src/a.ts',
            firstSeenAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(), // now
            resolvedCommit: 'c2',
          },
          {
            findingId: 'f2',
            ruleId: 'SEC-XSS-001',
            category: 'xss',
            severity: 'warning',
            file: 'src/b.ts',
            firstSeenAt: new Date(now - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c3',
          },
        ],
      };
      manager.save(timeline);

      const result = manager.computeTimeToFix();
      expect(result.overall.count).toBe(2);
      expect(result.overall.mean).toBe(3); // (2+4)/2 = 3
      expect(result.overall.median).toBe(3); // (2+4)/2 = 3
      expect(result.byCategory['injection']!.count).toBe(1);
      expect(result.byCategory['injection']!.mean).toBe(2);
      expect(result.byCategory['xss']!.count).toBe(1);
      expect(result.byCategory['xss']!.mean).toBe(4);
    });

    it('reports open findings and oldest open days', () => {
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'f1',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: 'src/a.ts',
            firstSeenAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
            firstSeenCommit: 'c1',
            resolvedAt: null,
            resolvedCommit: null,
          },
        ],
      };
      manager.save(timeline);

      const result = manager.computeTimeToFix();
      expect(result.openFindings).toBe(1);
      expect(result.oldestOpenDays).toBeGreaterThanOrEqual(9.9);
      expect(result.oldestOpenDays).toBeLessThanOrEqual(10.1);
    });
  });

  // --- trends() ---

  describe('trends()', () => {
    it('returns empty result for 0 snapshots', () => {
      const result = manager.trends();
      expect(result.snapshotCount).toBe(0);
      expect(result.score.direction).toBe('stable');
      expect(result.attribution).toEqual([]);
    });

    it('returns stable for single snapshot', () => {
      manager.capture(makeScanResult([]), 'only');
      const result = manager.trends();
      expect(result.snapshotCount).toBe(1);
      expect(result.score.direction).toBe('stable');
    });

    it('computes directional trends between first and last', () => {
      // First snapshot: 0 findings (score 100)
      manager.capture(makeScanResult([]), 'first');
      // Second snapshot: 5 errors (score 100 - 15 = 85)
      const findings = Array.from({ length: 5 }, (_, i) =>
        makeFinding({ severity: 'error', ruleId: `r${i}`, match: `m${i}` })
      );
      manager.capture(makeScanResult(findings), 'second');

      const result = manager.trends();
      expect(result.snapshotCount).toBe(2);
      expect(result.score.direction).toBe('declining'); // 100 → 85
      expect(result.totalFindings.direction).toBe('declining'); // 0 → 5 (more findings = declining)
    });

    it('includes attribution entries for changed categories', () => {
      manager.capture(makeScanResult([]), 'first');

      const findings = [
        makeFinding({ category: 'injection', ruleId: 'r1', match: 'm1' }),
        makeFinding({ category: 'injection', ruleId: 'r2', match: 'm2' }),
        makeFinding({ category: 'secrets', ruleId: 'r3', match: 'm3' }),
      ];
      manager.capture(makeScanResult(findings), 'second');

      const result = manager.trends();
      expect(result.attribution.length).toBeGreaterThan(0);

      const injectionAttr = result.attribution.find((a) => a.category === 'injection');
      expect(injectionAttr).toBeDefined();
      expect(injectionAttr!.delta).toBe(2);
      expect(injectionAttr!.direction).toBe('declining');
      expect(injectionAttr!.description).toBe('+2 injection findings');
    });

    it('respects last option', () => {
      manager.capture(makeScanResult([]), 'h1');
      manager.capture(makeScanResult([makeFinding()]), 'h2');
      manager.capture(
        makeScanResult([makeFinding(), makeFinding({ ruleId: 'r2', match: 'm2' })]),
        'h3'
      );

      const result = manager.trends({ last: 2 });
      expect(result.snapshotCount).toBe(2);
      // Only h2 and h3: 1 finding → 2 findings
      expect(result.totalFindings.current).toBe(2);
      expect(result.totalFindings.previous).toBe(1);
    });
  });

  // --- securityFindingId() ---

  describe('securityFindingId()', () => {
    it('produces stable IDs for same input', () => {
      const id1 = securityFindingId({ ruleId: 'SEC-INJ-001', file: 'src/a.ts', match: 'eval(x)' });
      const id2 = securityFindingId({ ruleId: 'SEC-INJ-001', file: 'src/a.ts', match: 'eval(x)' });
      expect(id1).toBe(id2);
    });

    it('produces different IDs for different inputs', () => {
      const id1 = securityFindingId({ ruleId: 'SEC-INJ-001', file: 'src/a.ts', match: 'eval(x)' });
      const id2 = securityFindingId({ ruleId: 'SEC-INJ-002', file: 'src/a.ts', match: 'eval(x)' });
      expect(id1).not.toBe(id2);
    });

    it('returns a 16-char hex string', () => {
      const id = securityFindingId({ ruleId: 'SEC-INJ-001', file: 'f.ts', match: 'x' });
      expect(id).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  // --- Additional branch coverage ---

  describe('edge cases', () => {
    it('load() handles schema-invalid JSON (valid JSON, wrong shape)', () => {
      const p = timelinePath(root);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ version: 99, bad: true }));
      const result = manager.load();
      expect(result).toEqual({ version: 1, snapshots: [], findingLifecycles: [] });
    });

    it('trends() with since filter', () => {
      // Write snapshots with explicit timestamps to avoid timing issues
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [
          {
            capturedAt: new Date(now - 10000).toISOString(),
            commitHash: 'h1',
            securityScore: 100,
            totalFindings: 0,
            bySeverity: { error: 0, warning: 0, info: 0 },
            byCategory: {},
            supplyChain: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
            suppressionCount: 0,
            findingIds: [],
          },
          {
            capturedAt: new Date(now).toISOString(),
            commitHash: 'h2',
            securityScore: 97,
            totalFindings: 1,
            bySeverity: { error: 1, warning: 0, info: 0 },
            byCategory: {},
            supplyChain: { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 },
            suppressionCount: 0,
            findingIds: ['abc'],
          },
        ],
        findingLifecycles: [],
      };
      manager.save(timeline);

      // since between the two snapshots — should only include second
      const since = new Date(now - 5000).toISOString();
      const result = manager.trends({ since });
      expect(result.snapshotCount).toBe(1);
    });

    it('computeTimeToFix() with category filter', () => {
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'f1',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: 'src/a.ts',
            firstSeenAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c2',
          },
          {
            findingId: 'f2',
            ruleId: 'SEC-XSS-001',
            category: 'xss',
            severity: 'warning',
            file: 'src/b.ts',
            firstSeenAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c3',
          },
        ],
      };
      manager.save(timeline);

      const result = manager.computeTimeToFix({ category: 'injection' });
      expect(result.overall.count).toBe(1);
      expect(result.overall.mean).toBe(3);
    });

    it('computeTimeToFix() with since filter', () => {
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'f1',
            ruleId: 'SEC-INJ-001',
            category: 'injection',
            severity: 'error',
            file: 'src/a.ts',
            firstSeenAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c2',
          },
          {
            findingId: 'f2',
            ruleId: 'SEC-XSS-001',
            category: 'xss',
            severity: 'warning',
            file: 'src/b.ts',
            firstSeenAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c3',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c4',
          },
        ],
      };
      manager.save(timeline);

      // since 5 days ago — should only include f2
      const since = new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString();
      const result = manager.computeTimeToFix({ since });
      expect(result.overall.count).toBe(1);
      expect(result.overall.mean).toBe(2);
    });

    it('capture() with supply chain data', () => {
      const supply = { critical: 2, high: 1, moderate: 3, low: 0, info: 0, total: 6 };
      const snapshot = manager.capture(makeScanResult([]), 'sc', supply);
      expect(snapshot.supplyChain).toEqual(supply);
      // penalty: 2*5 + 1*3 + 3*1 = 16 → score 84
      expect(snapshot.securityScore).toBe(84);
    });

    it('trends() with improving direction (fewer findings over time)', () => {
      const findings = Array.from({ length: 5 }, (_, i) =>
        makeFinding({ severity: 'error', ruleId: `r${i}`, match: `m${i}` })
      );
      manager.capture(makeScanResult(findings), 'bad');
      manager.capture(makeScanResult([]), 'good');

      const result = manager.trends();
      expect(result.score.direction).toBe('improving');
      expect(result.totalFindings.direction).toBe('improving');
    });

    it('computeTimeToFix() median with odd number of values', () => {
      const now = Date.now();
      const timeline: SecurityTimelineFile = {
        version: 1,
        snapshots: [],
        findingLifecycles: [
          {
            findingId: 'f1',
            ruleId: 'r1',
            category: 'injection',
            severity: 'error',
            file: 'a.ts',
            firstSeenAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c2',
          },
          {
            findingId: 'f2',
            ruleId: 'r2',
            category: 'injection',
            severity: 'error',
            file: 'b.ts',
            firstSeenAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c3',
          },
          {
            findingId: 'f3',
            ruleId: 'r3',
            category: 'injection',
            severity: 'error',
            file: 'c.ts',
            firstSeenAt: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
            firstSeenCommit: 'c1',
            resolvedAt: new Date(now).toISOString(),
            resolvedCommit: 'c4',
          },
        ],
      };
      manager.save(timeline);

      const result = manager.computeTimeToFix();
      expect(result.overall.count).toBe(3);
      expect(result.overall.median).toBe(3); // sorted: [1, 3, 5], median = 3
    });
  });
});
