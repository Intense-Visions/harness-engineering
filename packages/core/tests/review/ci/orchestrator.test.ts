import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Mock the pipeline so NO real review runs. The orchestrator only depends on its
// ReviewPipelineResult shape (skipped / stoppedByMechanical / assessment / findings).
// vi.hoisted lets the mock fn exist before the hoisted vi.mock factory references it.
const { runReviewPipeline } = vi.hoisted(() => ({ runReviewPipeline: vi.fn() }));
vi.mock('../../../src/review/pipeline-orchestrator', () => ({ runReviewPipeline }));

// Imported AFTER vi.mock so the mock is in place.
import { runCiReview, type ExecFileLike } from '../../../src/review/ci/orchestrator';
import { parseCiReviewVerdict } from '../../../src/review/ci/verdict-schema';
import type { LocalEndpointInvoke } from '../../../src/review/ci/runner-presets';

const fx = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

// A DiffInfo stub — only fileDiffs is read by the orchestrator (for the STDIN string).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const diff = { fileDiffs: new Map([['src/x.ts', 'diff --git a/src/x.ts b/src/x.ts']]) } as any;

const floorClean = {
  skipped: false,
  stoppedByMechanical: false,
  assessment: 'approve' as const,
  findings: [],
  strengths: [],
  terminalOutput: '',
  githubComments: [],
  exitCode: 0,
};

const floorMechStop = {
  skipped: false,
  stoppedByMechanical: true,
  assessment: 'request-changes' as const,
  findings: [],
  strengths: [],
  terminalOutput: '',
  githubComments: [],
  exitCode: 1,
};

// A fully-formed critical ReviewFinding the floor can emit.
const criticalFloorFinding = {
  id: 'floor-crit-1',
  file: 'src/x.ts',
  lineRange: [1, 2] as [number, number],
  domain: 'security' as const,
  severity: 'critical' as const,
  title: 'Floor critical',
  rationale: 'A heuristic critical from the floor.',
  evidence: ['src/x.ts:1'],
  validatedBy: 'mechanical' as const,
};

const importantFloorFinding = {
  id: 'floor-imp-1',
  file: 'src/x.ts',
  lineRange: [3, 4] as [number, number],
  domain: 'architecture' as const,
  severity: 'important' as const,
  title: 'Floor important',
  rationale: 'A heuristic important from the floor.',
  evidence: ['src/x.ts:3'],
  validatedBy: 'heuristic' as const,
};

beforeEach(() => {
  runReviewPipeline.mockReset();
});

describe('runCiReview — SC1 (floor-only gating)', () => {
  it('floor-only clean diff → exitCode 0, runner floor-only, ranLlmTier false, no seam call', async () => {
    runReviewPipeline.mockResolvedValue(floorClean);
    const execFile = vi.fn();
    const r = await runCiReview({ projectRoot: '/p', diff, execFile });
    expect(execFile).not.toHaveBeenCalled();
    expect(r.exitCode).toBe(0);
    expect(r.verdict.runner).toBe('floor-only');
    expect(r.ranLlmTier).toBe(false);
  });

  it('floor mechanical-stop short-circuits → exitCode 1, ranLlmTier false, seam NEVER called', async () => {
    runReviewPipeline.mockResolvedValue(floorMechStop);
    const execFile = vi.fn();
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      execFile,
    });
    expect(execFile).not.toHaveBeenCalled();
    expect(r.exitCode).toBe(1);
    expect(r.ranLlmTier).toBe(false);
    expect(r.verdict.runner).toBe('floor-only');
    expect(r.llmSkipReason).toMatch(/mechanical-stop/);
  });

  it('floor skipped (PR ineligible) → fails closed: exitCode 1, ranLlmTier false, seam NEVER called', async () => {
    // SUG-5: a skipped floor must NOT be treated as a clean (green) gate. A future
    // caller wiring prMetadata could make runReviewPipeline return skipped:true; the
    // CI orchestrator owns no eligibility semantics, so it blocks rather than approve.
    runReviewPipeline.mockResolvedValue({
      skipped: true,
      skipReason: 'draft PR',
      stoppedByMechanical: false,
      assessment: 'approve' as const,
      findings: [],
      strengths: [],
      terminalOutput: '',
      githubComments: [],
      exitCode: 0,
    });
    const execFile = vi.fn();
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      execFile,
    });
    expect(execFile).not.toHaveBeenCalled();
    expect(r.exitCode).toBe(1);
    expect(r.ranLlmTier).toBe(false);
    expect(r.verdict.runner).toBe('floor-only');
    expect(r.verdict.skipped).toBe(true);
    expect(r.llmSkipReason).toMatch(/skipped/);
    expect(r.llmSkipReason).toMatch(/draft PR/);
  });

  it('floor with a critical heuristic finding → exitCode 1', async () => {
    runReviewPipeline.mockResolvedValue({
      ...floorClean,
      assessment: 'request-changes',
      findings: [criticalFloorFinding],
    });
    const r = await runCiReview({ projectRoot: '/p', diff });
    expect(r.exitCode).toBe(1);
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.verdict.blockingFindings).toHaveLength(1);
  });
});

describe('runCiReview — SC2 (secret-gated LLM tier + graceful skip)', () => {
  it('secret present → seam invoked with diff on STDIN, ranLlmTier true, claude findings merged', async () => {
    runReviewPipeline.mockResolvedValue(floorClean);
    const execFile: ExecFileLike = vi.fn().mockResolvedValue({ stdout: fx('claude-verdict.json') });
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      execFile,
    });
    expect(execFile).toHaveBeenCalledOnce();
    // diff piped to STDIN:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((execFile as any).mock.calls[0][2].stdin).toContain('diff --git');
    // command from the claude preset:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((execFile as any).mock.calls[0][0]).toBe('claude');
    expect(r.ranLlmTier).toBe(true);
    expect(r.verdict.runner).toBe('claude');
    expect(r.verdict.findings.length).toBeGreaterThan(0); // claude fixture has 1 critical
    expect(r.llmSkipReason).toBeUndefined();
  });

  it('secret absent → graceful skip, ranLlmTier false, llmSkipReason set, seam NOT called, no throw', async () => {
    runReviewPipeline.mockResolvedValue(floorClean);
    const execFile = vi.fn();
    const r = await runCiReview({ projectRoot: '/p', diff, runner: 'claude', env: {}, execFile });
    expect(execFile).not.toHaveBeenCalled();
    expect(r.ranLlmTier).toBe(false);
    expect(r.llmSkipReason).toMatch(/secret ANTHROPIC_API_KEY/);
    expect(r.verdict.runner).toBe('floor-only');
    expect(r.exitCode).toBe(0);
  });

  it('unsupported runner (cursor) → graceful skip with unsupported reason, no throw', async () => {
    runReviewPipeline.mockResolvedValue(floorClean);
    const execFile = vi.fn();
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'cursor',
      env: { ANYTHING: 'x' },
      execFile,
    });
    expect(execFile).not.toHaveBeenCalled();
    expect(r.ranLlmTier).toBe(false);
    expect(r.llmSkipReason).toMatch(/unsupported/);
    expect(r.verdict.runner).toBe('floor-only');
  });

  it('endpoint runner with no localInvoke → graceful skip', async () => {
    runReviewPipeline.mockResolvedValue(floorClean);
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'local',
      env: { HARNESS_LOCAL_ENDPOINT: 'http://x', HARNESS_LOCAL_MODEL: 'm' },
      // no localInvoke — the preset's invoke is unset
    });
    expect(r.ranLlmTier).toBe(false);
    expect(r.llmSkipReason).toMatch(/local endpoint not configured/);
    expect(r.verdict.runner).toBe('floor-only');
  });
});

// Wrap an inner {assessment, findings} verdict in the claude transcript envelope the
// claude parser reads (`.result` is a JSON string). Used to drive arbitrary assessments
// through the REAL parser path for the threshold matrix.
const claudeEnvelope = (inner: { assessment: string; findings: unknown[] }): string =>
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(inner),
  });

const commentInnerFinding = {
  id: 'llm-comment-1',
  file: 'src/x.ts',
  lineRange: [10, 12],
  domain: 'architecture',
  severity: 'important',
  title: 'Naming nit',
  rationale: 'Prefer a clearer identifier.',
  evidence: ['src/x.ts:10'],
  validatedBy: 'heuristic',
};

const runClaude = (
  stdout: string,
  extra?: Partial<Parameters<typeof runCiReview>[0]>
): ReturnType<typeof runCiReview> => {
  const execFile: ExecFileLike = vi.fn().mockResolvedValue({ stdout });
  return runCiReview({
    projectRoot: '/p',
    diff,
    runner: 'claude',
    env: { ANTHROPIC_API_KEY: 'x' },
    execFile,
    ...extra,
  });
};

describe('runCiReview — SC3 (anti-theatre threshold matrix)', () => {
  beforeEach(() => runReviewPipeline.mockResolvedValue(floorClean));

  it('request-changes verdict under default blockOn → exitCode 1', async () => {
    const r = await runClaude(fx('claude-verdict.json')); // request-changes + 1 critical
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.exitCode).toBe(1);
  });

  it('same request-changes verdict under blockOn none → exitCode 0', async () => {
    const r = await runClaude(fx('claude-verdict.json'), { blockOn: 'none' });
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.exitCode).toBe(0);
  });

  it('comment verdict under blockOn request-changes (default) → exitCode 0', async () => {
    const r = await runClaude(
      claudeEnvelope({ assessment: 'comment', findings: [commentInnerFinding] })
    );
    expect(r.verdict.assessment).toBe('comment');
    expect(r.exitCode).toBe(0);
  });

  it('comment verdict under blockOn comment → exitCode 1', async () => {
    const r = await runClaude(
      claudeEnvelope({ assessment: 'comment', findings: [commentInnerFinding] }),
      {
        blockOn: 'comment',
      }
    );
    expect(r.verdict.assessment).toBe('comment');
    expect(r.exitCode).toBe(1);
  });

  it('approve verdict under blockOn request-changes → exitCode 0', async () => {
    const r = await runClaude(claudeEnvelope({ assessment: 'approve', findings: [] }));
    expect(r.verdict.assessment).toBe('approve');
    expect(r.exitCode).toBe(0);
  });

  it('required runner fails to execute (execFile rejects) → exitCode 1 even on clean floor', async () => {
    const execFile: ExecFileLike = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      execFile,
    });
    expect(r.ranLlmTier).toBe(false);
    expect(r.exitCode).toBe(1);
    expect(r.llmSkipReason).toMatch(/failed/);
  });

  it('required runner fails under blockOn none → STILL exitCode 1 (failure not gated by none)', async () => {
    const execFile: ExecFileLike = vi.fn().mockRejectedValue(new Error('spawn ENOENT'));
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      blockOn: 'none',
      execFile,
    });
    expect(r.exitCode).toBe(1);
    expect(r.llmSkipReason).toMatch(/failed/);
  });
});

describe('runCiReview — SC4 (per-runner normalization against REAL fixtures)', () => {
  beforeEach(() => runReviewPipeline.mockResolvedValue(floorClean));

  it('claude fixture → runner claude, request-changes, ≥1 blocking, schema-valid', async () => {
    const r = await runClaude(fx('claude-verdict.json'));
    expect(() => parseCiReviewVerdict(r.verdict)).not.toThrow();
    expect(r.verdict.runner).toBe('claude');
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.verdict.blockingFindings.length).toBeGreaterThanOrEqual(1);
    expect(r.verdict.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
  });

  it('codex fixture → runner codex, approve, schema-valid', async () => {
    const execFile: ExecFileLike = vi.fn().mockResolvedValue({ stdout: fx('codex-verdict.jsonl') });
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'codex',
      env: { OPENAI_API_KEY: 'x' },
      execFile,
    });
    expect(() => parseCiReviewVerdict(r.verdict)).not.toThrow();
    expect(r.verdict.runner).toBe('codex');
    expect(r.verdict.assessment).toBe('approve');
    expect(r.exitCode).toBe(0);
  });

  it('antigravity fixture → runner antigravity, approve, schema-valid', async () => {
    const execFile: ExecFileLike = vi
      .fn()
      .mockResolvedValue({ stdout: fx('antigravity-verdict.txt') });
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'antigravity',
      env: { GEMINI_API_KEY: 'x' },
      execFile,
    });
    expect(() => parseCiReviewVerdict(r.verdict)).not.toThrow();
    expect(r.verdict.runner).toBe('antigravity');
    expect(r.verdict.assessment).toBe('approve');
  });

  it('local fixture via injected localInvoke → runner local, request-changes, findings merged; seam args correct', async () => {
    const localInvoke: LocalEndpointInvoke = vi.fn().mockResolvedValue(fx('local-verdict.json'));
    const r = await runCiReview({
      projectRoot: '/p',
      diff,
      runner: 'local',
      env: { HARNESS_LOCAL_ENDPOINT: 'http://x', HARNESS_LOCAL_MODEL: 'm' },
      localInvoke,
    });
    expect(localInvoke).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seamArgs = (localInvoke as any).mock.calls[0][0];
    expect(seamArgs).toMatchObject({ endpoint: 'http://x', model: 'm' });
    expect(typeof seamArgs.instruction).toBe('string');
    expect(seamArgs.diff).toContain('diff --git');
    expect(() => parseCiReviewVerdict(r.verdict)).not.toThrow();
    expect(r.verdict.runner).toBe('local');
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.exitCode).toBe(1);
    // local fixture: 1 critical + 1 suggestion → 1 blocking.
    expect(r.verdict.blockingFindings.every((f) => f.severity === 'critical')).toBe(true);
  });

  it('merge: floor important finding + claude critical → both findings present, assessment request-changes', async () => {
    runReviewPipeline.mockResolvedValue({
      ...floorClean,
      assessment: 'comment',
      findings: [importantFloorFinding],
    });
    const r = await runClaude(fx('claude-verdict.json')); // adds 1 critical
    expect(r.verdict.findings.length).toBe(2); // floor important + llm critical
    expect(r.verdict.assessment).toBe('request-changes');
    expect(r.verdict.blockingFindings).toHaveLength(1);
    expect(r.exitCode).toBe(1);
  });
});
