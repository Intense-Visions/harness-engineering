import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { newContext } from '../../../src/design-pipeline/context';

/**
 * #2070, the last call site. The three design verifiers now abstain (throw)
 * rather than reporting a clean scan over nothing. Six of the seven
 * detect-drift call sites record that on `verifiersFailed`. This one did not:
 * `safelyRedetect` collapsed every failure to `null` and the loop `break`d, so
 * a fix loop that stopped because it could not VERIFY its last iteration was
 * indistinguishable from one that stopped because it had CONVERGED.
 */
vi.mock('../../../src/mcp/tools/align-design-system', () => ({
  runAlignDesignSystem: vi.fn(),
}));
vi.mock('../../../src/mcp/tools/detect-drift', () => ({
  runDetectDrift: vi.fn(),
}));

const { runAlignDesignSystem } = await import('../../../src/mcp/tools/align-design-system');
const { runDetectDrift } = await import('../../../src/mcp/tools/detect-drift');
const { runFix } = await import('../../../src/design-pipeline/phases/fix');

const DRIFT_FINDING = {
  code: 'DRIFT-T001',
  severity: 'warn',
  file: 'src/a.tsx',
  line: 1,
  message: 'hardcoded colour',
  fix: { description: 'use a token' },
};

describe('design-pipeline FIX phase re-detect (#2070)', () => {
  let dir = '';

  beforeEach(() => {
    vi.clearAllMocks();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-phase-'));
    // align applies one fix, so the loop proceeds to the re-detect.
    vi.mocked(runAlignDesignSystem).mockResolvedValue({
      outcomes: [],
      summary: { applied: 1 },
    } as never);
  });

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  function context() {
    const ctx = newContext();
    ctx.driftFindings = [DRIFT_FINDING as never];
    return ctx;
  }

  it('records the abstention on verifiersFailed when the re-detect cannot run', async () => {
    vi.mocked(runDetectDrift).mockRejectedValue(
      new Error('detect-design-drift read no files under ' + dir)
    );

    const ctx = context();
    await runFix({ projectRoot: dir, context: ctx, mode: 'fast' });

    // The defect: verifiersFailed stayed EMPTY and the loop looked converged.
    expect(ctx.verifiersFailed.map((v) => v.name)).toContain('detect-drift');
    expect(ctx.verifiersFailed.find((v) => v.name === 'detect-drift')?.error).toContain(
      'read no files'
    );
  });

  it('leaves verifiersFailed empty when the re-detect genuinely converges', async () => {
    vi.mocked(runDetectDrift).mockResolvedValue({ findings: [] } as never);

    const ctx = context();
    await runFix({ projectRoot: dir, context: ctx, mode: 'fast' });

    // A real convergence must stay distinguishable from an abstention.
    expect(ctx.verifiersFailed).toEqual([]);
    expect(ctx.driftFindings).toEqual([]);
  });
});
