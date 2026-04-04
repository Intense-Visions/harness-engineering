/**
 * Integration test: full recommendation pipeline.
 *
 * Exercises captureHealthSnapshot -> recommend -> structured output
 * with mocked tool handlers but real engine logic. Validates that
 * data flows correctly through all layers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Mock external tool handlers (I/O boundary) but keep engine logic real
vi.mock('../../src/mcp/tools/assess-project', () => ({
  handleAssessProject: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          healthy: false,
          checks: [
            { name: 'deps', passed: false, issueCount: 5 },
            { name: 'entropy', passed: false, issueCount: 3 },
            { name: 'security', passed: false, issueCount: 2 },
            { name: 'perf', passed: true, issueCount: 0 },
            { name: 'docs', passed: false, issueCount: 8 },
            { name: 'lint', passed: true, issueCount: 0 },
          ],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/architecture', () => ({
  handleCheckDependencies: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          valid: false,
          violations: [
            {
              reason: 'CIRCULAR_DEP',
              file: 'a.ts',
              imports: 'b.ts',
              fromLayer: 'services',
              toLayer: 'controllers',
              line: 10,
              suggestion: '',
            },
            {
              reason: 'CIRCULAR_DEP',
              file: 'b.ts',
              imports: 'a.ts',
              fromLayer: 'controllers',
              toLayer: 'services',
              line: 5,
              suggestion: '',
            },
            {
              reason: 'WRONG_LAYER',
              file: 'c.ts',
              imports: 'd.ts',
              fromLayer: 'ui',
              toLayer: 'data',
              line: 3,
              suggestion: '',
            },
          ],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/entropy', () => ({
  handleDetectEntropy: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          deadCode: { unusedExports: ['fn1', 'fn2'], unusedImports: [], deadFiles: ['old.ts'] },
          drift: { staleReferences: ['ref1'], missingTargets: [] },
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/tools/security', () => ({
  handleRunSecurityScan: vi.fn().mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          findings: [{ severity: 'error', rule: 'no-eval', message: 'eval detected' }],
        }),
      },
    ],
  }),
}));

vi.mock('../../src/mcp/utils/graph-loader', () => ({
  loadGraphStore: vi.fn().mockResolvedValue(null),
}));

// Mock child_process for git HEAD
vi.mock('child_process', async () => {
  const actual = await vi.importActual('child_process');
  return {
    ...(actual as object),
    execSync: vi.fn().mockReturnValue('integration-test-sha\n'),
  };
});

import { captureHealthSnapshot, isSnapshotFresh } from '../../src/skill/health-snapshot';
import { recommend } from '../../src/skill/recommendation-engine';
import type { RecommendationResult } from '../../src/skill/recommendation-types';

describe('Recommendation Pipeline Integration', { timeout: 10000 }, () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join('/tmp', 'rec-pipeline-'));
    fs.mkdirSync(path.join(tmpDir, '.harness'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full pipeline: capture -> recommend -> structured result', async () => {
    // Step 1: Capture health snapshot (uses mocked tool handlers)
    const snapshot = await captureHealthSnapshot(tmpDir);

    // Verify snapshot was captured with expected signals
    expect(snapshot.gitHead).toBe('integration-test-sha');
    expect(snapshot.projectPath).toBe(tmpDir);
    expect(snapshot.checks.deps.circularDeps).toBe(2);
    expect(snapshot.checks.deps.layerViolations).toBe(1);
    expect(snapshot.checks.entropy.deadExports).toBe(2);
    expect(snapshot.checks.entropy.deadFiles).toBe(1);
    expect(snapshot.checks.entropy.driftCount).toBe(1);
    expect(snapshot.signals).toContain('circular-deps');
    expect(snapshot.signals).toContain('layer-violations');
    expect(snapshot.signals).toContain('dead-code');
    expect(snapshot.signals).toContain('drift');
    expect(snapshot.signals).toContain('doc-gaps');

    // Step 2: Feed snapshot into recommendation engine with fallback rules
    const skills: Record<string, { addresses: any[]; dependsOn: string[] }> = {};
    const result: RecommendationResult = recommend(snapshot, skills, { top: 10 });

    // Step 3: Verify structured result
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.sequenceReasoning).toBeTruthy();

    // Critical recommendations should exist for circular-deps and layer-violations
    const critical = result.recommendations.filter((r) => r.urgency === 'critical');
    expect(critical.length).toBeGreaterThanOrEqual(1);
    // enforce-architecture fallback has hard rules for circular-deps + layer-violations
    expect(critical.some((r) => r.skillName === 'enforce-architecture')).toBe(true);

    // Verify all recommendations have valid structure
    for (const rec of result.recommendations) {
      expect(rec.skillName).toBeTruthy();
      expect(rec.score).toBeGreaterThanOrEqual(0);
      expect(rec.score).toBeLessThanOrEqual(1);
      expect(['critical', 'recommended', 'nice-to-have']).toContain(rec.urgency);
      expect(rec.sequence).toBeGreaterThanOrEqual(1);
      expect(rec.reasons.length).toBeGreaterThan(0);
      expect(rec.triggeredBy.length).toBeGreaterThan(0);
    }

    // Verify sequence numbers are monotonically increasing
    for (let i = 1; i < result.recommendations.length; i++) {
      expect(result.recommendations[i]!.sequence).toBeGreaterThan(
        result.recommendations[i - 1]!.sequence
      );
    }
  });

  it('snapshot cache round-trip works within pipeline', async () => {
    // Capture writes to cache
    const snapshot = await captureHealthSnapshot(tmpDir);

    // Verify cache file was written
    const cachePath = path.join(tmpDir, '.harness', 'health-snapshot.json');
    expect(fs.existsSync(cachePath)).toBe(true);

    // Read back and verify it matches
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    expect(cached.gitHead).toBe(snapshot.gitHead);
    expect(cached.signals).toEqual(snapshot.signals);

    // Verify freshness check works with the cached snapshot
    expect(isSnapshotFresh(cached, tmpDir)).toBe(true);
  });

  it('empty signals produce empty recommendations', async () => {
    // Override assess-project mock to return all-clean
    const assessMock = await import('../../src/mcp/tools/assess-project');
    vi.mocked(assessMock.handleAssessProject).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            healthy: true,
            checks: [
              { name: 'deps', passed: true, issueCount: 0 },
              { name: 'entropy', passed: true, issueCount: 0 },
              { name: 'security', passed: true, issueCount: 0 },
              { name: 'perf', passed: true, issueCount: 0 },
              { name: 'docs', passed: true, issueCount: 0 },
              { name: 'lint', passed: true, issueCount: 0 },
            ],
          }),
        },
      ],
    });
    const archMock = await import('../../src/mcp/tools/architecture');
    vi.mocked(archMock.handleCheckDependencies).mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ valid: true, violations: [] }) }],
    });
    const entropyMock = await import('../../src/mcp/tools/entropy');
    vi.mocked(entropyMock.handleDetectEntropy).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            deadCode: { unusedExports: [], unusedImports: [], deadFiles: [] },
            drift: { staleReferences: [], missingTargets: [] },
          }),
        },
      ],
    });
    const secMock = await import('../../src/mcp/tools/security');
    vi.mocked(secMock.handleRunSecurityScan).mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify({ findings: [] }) }],
    });

    const snapshot = await captureHealthSnapshot(tmpDir);
    expect(snapshot.signals).toEqual([]);

    const result = recommend(snapshot, {});
    expect(result.recommendations).toHaveLength(0);
    expect(result.sequenceReasoning).toContain('No active signals');
  });
});
