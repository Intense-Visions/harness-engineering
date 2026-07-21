import { describe, it, expect, vi, beforeEach } from 'vitest';

// The DETECT phase orchestrator statically imports `runDetectDrift` from the
// detect-drift tool. We mock exactly that module (same relative specifier the
// SUT uses) so the test is hermetic: no real filesystem scan, no token/registry
// loading, no subprocess. We assert the observable contract — the arguments
// forwarded to runDetectDrift, and how the returned findings (or a thrown
// error) are folded into the DesignPipelineContext.
const mocks = vi.hoisted(() => ({
  runDetectDrift: vi.fn(),
}));

// Same relative specifier as `import { runDetectDrift } from
// '../../mcp/tools/detect-drift.js'` in detect.ts. Because this test sits in the
// SUT's directory, it resolves to the identical module id the SUT imports.
vi.mock('../../mcp/tools/detect-drift.js', () => ({
  runDetectDrift: mocks.runDetectDrift,
}));

import { runDetect } from './detect.js';
import { newContext } from '../context.js';
import type { DriftFinding } from '../../drift/findings/finding.js';

const PROJECT_ROOT = '/repo/project';

/**
 * Build a deterministic DriftFinding. Distinct `line` values let us prove
 * identity/ordering of the folded array without relying on real scanning.
 */
function makeFinding(line: number): DriftFinding {
  return {
    code: 'DRIFT-T001',
    severity: 'error',
    file: 'src/Button.tsx',
    line,
    message: `hardcoded value at line ${line}`,
    evidence: { snippet: '#fff' },
    rule: { id: 'DRIFT-T001', category: 'token-bypass' },
    fix: { kind: 'manual', description: 'use a token' },
  };
}

/**
 * Minimal stand-in for the runDetectDrift Verifier output; the SUT only reads
 * `.findings`, so the remaining Verifier fields are populated just enough to be
 * shape-faithful without asserting on them.
 */
function makeDriftOutput(findings: DriftFinding[]) {
  return {
    findings,
    summary: {
      totalFiles: findings.length,
      durationMs: 0,
      bySeverity: { error: findings.length, warn: 0, info: 0 },
      byCode: {},
    },
    catalog: { rulesApplied: [] },
    meta: { mode: 'fast' as const, tokensLoaded: false, registryLoaded: false },
  };
}

describe('runDetect (design-pipeline phase 2: DETECT)', () => {
  beforeEach(() => {
    mocks.runDetectDrift.mockReset();
  });

  it('folds returned findings into context and records the verifier as run', async () => {
    const findings = [makeFinding(1), makeFinding(2)];
    mocks.runDetectDrift.mockResolvedValue(makeDriftOutput(findings));
    const context = newContext();

    await runDetect({ projectRoot: PROJECT_ROOT, context, mode: 'fast' });

    expect(context.driftFindings).toEqual(findings);
    expect(context.verifiersRun).toEqual(['detect-drift']);
    expect(context.verifiersFailed).toEqual([]);
  });

  it('copies the findings array rather than aliasing the verifier result', async () => {
    const findings = [makeFinding(1)];
    mocks.runDetectDrift.mockResolvedValue(makeDriftOutput(findings));
    const context = newContext();

    await runDetect({ projectRoot: PROJECT_ROOT, context, mode: 'full' });

    // Same contents...
    expect(context.driftFindings).toEqual(findings);
    // ...but a distinct array, so later mutation of the source cannot leak in.
    expect(context.driftFindings).not.toBe(findings);
  });

  it('forwards only path and mode when files and strictness are omitted', async () => {
    mocks.runDetectDrift.mockResolvedValue(makeDriftOutput([]));
    const context = newContext();

    await runDetect({ projectRoot: PROJECT_ROOT, context, mode: 'fast' });

    expect(mocks.runDetectDrift).toHaveBeenCalledTimes(1);
    const arg = mocks.runDetectDrift.mock.calls[0]![0];
    expect(arg).toEqual({ path: PROJECT_ROOT, mode: 'fast' });
    // Optional keys must be absent, not present-and-undefined.
    expect('files' in arg).toBe(false);
    expect('designStrictness' in arg).toBe(false);
  });

  it('forwards files and designStrictness when provided', async () => {
    mocks.runDetectDrift.mockResolvedValue(makeDriftOutput([]));
    const context = newContext();
    const files = ['src/a.tsx', 'src/b.tsx'];

    await runDetect({
      projectRoot: PROJECT_ROOT,
      context,
      mode: 'full',
      files,
      designStrictness: 'strict',
    });

    expect(mocks.runDetectDrift).toHaveBeenCalledWith({
      path: PROJECT_ROOT,
      mode: 'full',
      files,
      designStrictness: 'strict',
    });
  });

  it('records a verifier failure with the Error message and leaves findings untouched', async () => {
    mocks.runDetectDrift.mockRejectedValue(new Error('drift scan exploded'));
    const context = newContext();

    await runDetect({ projectRoot: PROJECT_ROOT, context, mode: 'fast' });

    expect(context.verifiersFailed).toEqual([
      { name: 'detect-drift', error: 'drift scan exploded' },
    ]);
    // Graceful degradation: nothing recorded as run, findings stay empty.
    expect(context.verifiersRun).toEqual([]);
    expect(context.driftFindings).toEqual([]);
  });

  it('stringifies a non-Error rejection into the failure record', async () => {
    mocks.runDetectDrift.mockRejectedValue('plain string failure');
    const context = newContext();

    await runDetect({ projectRoot: PROJECT_ROOT, context, mode: 'full' });

    expect(context.verifiersFailed).toEqual([
      { name: 'detect-drift', error: 'plain string failure' },
    ]);
    expect(context.verifiersRun).toEqual([]);
  });
});
