import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import { newContext, type DesignPipelineContext } from '../context.js';
import type { DriftFinding } from '../../drift/findings/finding.js';

/**
 * Unit contract for Phase 3 FIX (`runFix`). Pins the CURRENT behavior of the
 * convergence loop: the early no-drift return, the align→re-detect cadence, the
 * converged / no-progress / error stop conditions, the 5-iteration bound, and
 * the `.harness/handoff.json` pipeline handoff write.
 *
 * Fully hermetic: `runAlignDesignSystem`, `runDetectDrift`, and every `node:fs`
 * call the SUT makes are mocked, so there is no real IO, no subprocess, and no
 * network. Findings are opaque to `runFix` (it only reads `.length`), so tests
 * use minimal placeholder objects sized to drive the loop.
 */

const h = vi.hoisted(() => ({
  runAlign: vi.fn(),
  runDetect: vi.fn(),
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: h.existsSync,
  readFileSync: h.readFileSync,
  mkdirSync: h.mkdirSync,
  writeFileSync: h.writeFileSync,
}));

vi.mock('../../mcp/tools/align-design-system.js', () => ({
  runAlignDesignSystem: h.runAlign,
}));

vi.mock('../../mcp/tools/detect-drift.js', () => ({
  runDetectDrift: h.runDetect,
}));

import { runFix, type FixInput } from './fix.js';

const PROJECT_ROOT = '/tmp/project';

/** N opaque drift findings — `runFix` only ever reads `array.length`. */
function findings(count: number): DriftFinding[] {
  return Array.from({ length: count }, (_, i) => ({ id: `f${i}` })) as unknown as DriftFinding[];
}

/** Align result shape the SUT reads: `result.outcomes` + `result.summary.applied`. */
function alignResult(applied: number, outcomes: unknown[] = []) {
  return { outcomes, summary: { applied } };
}

function makeInput(context: DesignPipelineContext, over: Partial<FixInput> = {}): FixInput {
  return { projectRoot: PROJECT_ROOT, context, mode: 'fast', ...over };
}

function contextWithDrift(count: number): DesignPipelineContext {
  const ctx = newContext();
  ctx.driftFindings = findings(count);
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no pre-existing handoff on disk.
  h.existsSync.mockReturnValue(false);
});

describe('runFix', () => {
  it('returns immediately without aligning or writing when there is no drift', async () => {
    const ctx = newContext(); // driftFindings === []

    await runFix(makeInput(ctx));

    expect(h.runAlign).not.toHaveBeenCalled();
    expect(h.runDetect).not.toHaveBeenCalled();
    expect(h.writeFileSync).not.toHaveBeenCalled();
    expect(ctx.summary.iterationsRun).toBe(0);
  });

  it('stops on convergence (0 fixes applied) after a single align, without re-detecting', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockResolvedValue(alignResult(0, [{ kind: 'applied' }]));

    await runFix(makeInput(ctx));

    expect(h.runAlign).toHaveBeenCalledTimes(1);
    expect(h.runDetect).not.toHaveBeenCalled();
    // Outcomes are still collected even though the run converged.
    expect(ctx.fixesApplied).toEqual([{ kind: 'applied' }]);
    expect(ctx.summary.iterationsRun).toBe(0);
  });

  it('aligns with pipeline mode against the project root', async () => {
    const ctx = contextWithDrift(1);
    h.runAlign.mockResolvedValue(alignResult(0));

    await runFix(makeInput(ctx));

    expect(h.runAlign).toHaveBeenCalledWith({ path: PROJECT_ROOT, mode: 'pipeline' });
  });

  it('stops on no-progress when the re-detected drift count does not decrease', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockResolvedValue(alignResult(1));
    // Same count as before (2) => no progress => break before incrementing.
    h.runDetect.mockResolvedValue({ findings: findings(2) });

    await runFix(makeInput(ctx));

    expect(h.runAlign).toHaveBeenCalledTimes(1);
    expect(h.runDetect).toHaveBeenCalledTimes(1);
    expect(ctx.summary.iterationsRun).toBe(0);
    // Re-detected findings replace the context's findings.
    expect(ctx.driftFindings).toHaveLength(2);
  });

  it('loops while drift decreases and stops when a later align converges', async () => {
    const ctx = contextWithDrift(3);
    h.runAlign
      .mockResolvedValueOnce(alignResult(1)) // iter 0: applies fixes
      .mockResolvedValueOnce(alignResult(0)); // iter 1: converged
    h.runDetect.mockResolvedValueOnce({ findings: findings(2) }); // 2 < 3 => progress

    await runFix(makeInput(ctx));

    expect(h.runAlign).toHaveBeenCalledTimes(2);
    expect(h.runDetect).toHaveBeenCalledTimes(1);
    expect(ctx.summary.iterationsRun).toBe(1);
  });

  it('is bounded at 5 iterations even when drift keeps decreasing', async () => {
    const ctx = contextWithDrift(6);
    h.runAlign.mockResolvedValue(alignResult(1));
    // Strictly decreasing 5,4,3,2,1 keeps making progress every pass.
    let n = 5;
    h.runDetect.mockImplementation(async () => ({ findings: findings(n--) }));

    await runFix(makeInput(ctx));

    expect(h.runAlign).toHaveBeenCalledTimes(5);
    expect(ctx.summary.iterationsRun).toBe(5);
  });

  it('records a verifier failure and stops when align throws', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockRejectedValue(new Error('align boom'));

    await runFix(makeInput(ctx));

    expect(ctx.verifiersFailed).toEqual([{ name: 'align-design-system', error: 'align boom' }]);
    expect(h.runDetect).not.toHaveBeenCalled();
    expect(ctx.summary.iterationsRun).toBe(0);
  });

  it('stringifies non-Error align rejections in the verifier failure', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockRejectedValue('plain string failure');

    await runFix(makeInput(ctx));

    expect(ctx.verifiersFailed).toEqual([
      { name: 'align-design-system', error: 'plain string failure' },
    ]);
  });

  it('stops without touching the context findings when re-detect throws', async () => {
    const ctx = contextWithDrift(2);
    const original = ctx.driftFindings;
    h.runAlign.mockResolvedValue(alignResult(1));
    h.runDetect.mockRejectedValue(new Error('detect boom'));

    await runFix(makeInput(ctx));

    // safelyRedetect swallows the error and returns null -> loop breaks.
    expect(ctx.summary.iterationsRun).toBe(0);
    expect(ctx.driftFindings).toBe(original);
    expect(ctx.verifiersFailed).toEqual([]); // detect failure is silent, not recorded
  });

  it('forwards mode, files, and designStrictness to re-detect only when provided', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockResolvedValue(alignResult(1));
    h.runDetect.mockResolvedValue({ findings: findings(2) }); // no progress -> single detect

    await runFix(makeInput(ctx, { mode: 'full', files: ['a.tsx'], designStrictness: 'strict' }));

    expect(h.runDetect).toHaveBeenCalledWith({
      path: PROJECT_ROOT,
      mode: 'full',
      files: ['a.tsx'],
      designStrictness: 'strict',
    });
  });

  it('omits files and designStrictness from re-detect when they are undefined', async () => {
    const ctx = contextWithDrift(2);
    h.runAlign.mockResolvedValue(alignResult(1));
    h.runDetect.mockResolvedValue({ findings: findings(2) });

    await runFix(makeInput(ctx)); // files/designStrictness left undefined

    expect(h.runDetect).toHaveBeenCalledWith({ path: PROJECT_ROOT, mode: 'fast' });
  });

  describe('pipeline handoff write', () => {
    /** Parse the JSON payload of the last writeFileSync call. */
    function lastWrittenHandoff(): Record<string, unknown> {
      const calls = h.writeFileSync.mock.calls;
      const [pathArg, dataArg] = calls[calls.length - 1] as [string, string];
      expect(pathArg).toContain('handoff.json');
      return JSON.parse(dataArg as string);
    }

    it('writes the pipeline findings to .harness/handoff.json', async () => {
      const ctx = contextWithDrift(2);
      h.runAlign.mockResolvedValue(alignResult(0));

      await runFix(makeInput(ctx));

      const dir = path.dirname((h.writeFileSync.mock.calls[0] as [string])[0]);
      expect(h.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true });

      const written = lastWrittenHandoff();
      expect(written.pipeline).toEqual({ driftFindings: ctx.driftFindings });
    });

    it('merges the pipeline field into an existing handoff file', async () => {
      const ctx = contextWithDrift(1);
      h.runAlign.mockResolvedValue(alignResult(0));
      h.existsSync.mockReturnValue(true);
      h.readFileSync.mockReturnValue(JSON.stringify({ other: 'keep-me' }));

      await runFix(makeInput(ctx));

      const written = lastWrittenHandoff();
      expect(written.other).toBe('keep-me');
      expect(written.pipeline).toBeDefined();
    });

    it('recovers from a corrupt existing handoff file by starting fresh', async () => {
      const ctx = contextWithDrift(1);
      h.runAlign.mockResolvedValue(alignResult(0));
      h.existsSync.mockReturnValue(true);
      h.readFileSync.mockReturnValue('}{ not valid json');

      await expect(runFix(makeInput(ctx))).resolves.toBeUndefined();

      const written = lastWrittenHandoff();
      expect(written.other).toBeUndefined(); // corrupt content discarded
      expect(written.pipeline).toBeDefined();
    });
  });
});
