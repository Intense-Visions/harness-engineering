import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReviewPipeline } from '../../src/review/pipeline-orchestrator';
import type { DiffInfo, PipelineFlags } from '../../src/review/types';

/**
 * Seam tests for the finding-integrity layer (#984).
 *
 * The unit tests in finding-integrity.test.ts prove the invariants; these prove
 * the invariants are actually WIRED into the emission path — the pipeline's
 * Phase 5.75 and the CI orchestrator's LLM-tier pass — rather than living in an
 * unreferenced module.
 */

const FLAGS: PipelineFlags = { comment: false, ci: false, deep: false, noMechanical: true };

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

/** Create a throwaway project containing `files`, and the DiffInfo naming them. */
async function project(files: Record<string, string>): Promise<{ root: string; diff: DiffInfo }> {
  const root = await mkdtemp(join(tmpdir(), 'harness-984-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(join(root, rel, '..'), { recursive: true });
    await writeFile(join(root, rel), content, 'utf8');
  }
  const changed = Object.keys(files);
  return {
    root,
    diff: {
      changedFiles: changed,
      newFiles: changed,
      deletedFiles: [],
      totalDiffLines: 20,
      fileDiffs: new Map(changed.map((f) => [f, `+${files[f]!}`])),
    },
  };
}

describe('Phase 5.75 is wired into runReviewPipeline', () => {
  it('reports a denominator on every run', async () => {
    const { root, diff } = await project({ 'src/quiet.ts': 'export const answer = 42;\n' });

    const result = await runReviewPipeline({
      projectRoot: root,
      diff,
      commitMessage: 'chore: nothing to see',
      flags: FLAGS,
    });

    expect(result.integrityReport).toBeDefined();
    // The layer runs before dedup, so it examines at least the emitted count.
    expect(result.integrityReport!.examined).toBeGreaterThanOrEqual(result.findings.length);
    expect(result.terminalOutput).toContain('## Finding Integrity');
  });

  it('ABSTAINS rather than passing when there is nothing to examine', async () => {
    const result = await runReviewPipeline({
      projectRoot: '/tmp',
      diff: {
        changedFiles: [],
        newFiles: [],
        deletedFiles: [],
        totalDiffLines: 0,
        fileDiffs: new Map(),
      },
      commitMessage: 'chore: empty diff',
      flags: FLAGS,
    });

    expect(result.findings).toEqual([]);
    expect(result.integrityReport!.examined).toBe(0);
    expect(result.integrityReport!.abstained).toBe(true);
    expect(result.terminalOutput).toContain('ABSTAINED');
    expect(result.terminalOutput).toContain('no invariant was verified');
  });

  it("reconciles the security agent's heuristic 'high' confidence, without weakening its critical severity", async () => {
    const { root, diff } = await project({
      'src/danger.ts': 'export function run(input: string) {\n  return eval(input);\n}\n',
    });

    const result = await runReviewPipeline({
      projectRoot: root,
      diff,
      commitMessage: 'feat: add runner',
      flags: FLAGS,
    });

    const evalFinding = result.findings.find((f) => f.cweId === 'CWE-94');
    expect(evalFinding).toBeDefined();
    // Detection preserved: it is still a blocking critical.
    expect(evalFinding!.severity).toBe('critical');
    // Invariant 2 applied: the agent emits 'high'; heuristic provenance caps it.
    expect(evalFinding!.confidence).not.toBe('high');
    expect(
      evalFinding!.integrityViolations?.some((v) => v.invariant === 'confidence-reconciliation')
    ).toBe(true);

    const report = result.integrityReport!;
    expect(report.abstained).toBe(false);
    expect(report.examined).toBeGreaterThan(0);
    expect(report.confidenceReconciled).toBeGreaterThan(0);
    expect(result.terminalOutput).toContain('## Finding Integrity');
    expect(result.terminalOutput).toContain(`Findings examined: ${report.examined}`);
  });
});

describe('the CI orchestrator enforces the invariants on LLM-tier findings', () => {
  /** The #984 finding as an LLM-tier verdict, wrapped in the claude envelope. */
  const fabricatedVerdict = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({
      assessment: 'request-changes',
      findings: [
        {
          id: 'llm-fabricated-984',
          file: 'packages/cli/src/commands/roadmap/sync.ts',
          lineRange: [409, 409],
          domain: 'security',
          severity: 'critical',
          title: 'Potential SQL injection via string concatenation',
          rationale:
            'Past 400 lines a single TypeScript file encodes more than one responsibility.',
          evidence: ['File has 442 lines (threshold: 300)', 'File length: 442 lines'],
          validatedBy: 'heuristic',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 Injection',
          confidence: 'high',
          trustScore: 56,
        },
      ],
    }),
  });

  const legitimateVerdict = JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify({
      assessment: 'request-changes',
      findings: [
        {
          id: 'llm-real-sqli',
          file: 'src/repo.ts',
          lineRange: [88, 88],
          domain: 'security',
          severity: 'critical',
          title: 'Potential SQL injection via string concatenation',
          rationale: 'User-controlled id is concatenated into a SQL query.',
          evidence: ['Line 88: db.query("SELECT * FROM users WHERE id = " + userId)'],
          validatedBy: 'heuristic',
          cweId: 'CWE-89',
          owaspCategory: 'A03:2021 Injection',
        },
      ],
    }),
  });

  /** Run the CI orchestrator with a clean mocked floor and a stubbed claude runner. */
  async function runCi(stdout: string): Promise<{
    exitCode: number;
    assessment: string;
    terminalOutput: string;
    severities: string[];
    integrityAltered: number;
    integrityExamined: number;
  }> {
    vi.resetModules();
    vi.doMock('../../src/review/pipeline-orchestrator', () => ({
      runReviewPipeline: vi.fn().mockResolvedValue({
        skipped: false,
        stoppedByMechanical: false,
        assessment: 'approve',
        findings: [],
        strengths: [],
        terminalOutput: '',
        githubComments: [],
        exitCode: 0,
      }),
    }));
    const { runCiReview } = await import('../../src/review/ci/orchestrator');
    const r = await runCiReview({
      projectRoot: '/p',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      diff: { fileDiffs: new Map([['src/x.ts', 'diff']]) } as any,
      runner: 'claude',
      env: { ANTHROPIC_API_KEY: 'x' },
      execFile: vi.fn().mockResolvedValue({ stdout }),
    });
    vi.doUnmock('../../src/review/pipeline-orchestrator');
    return {
      exitCode: r.exitCode,
      assessment: r.verdict.assessment,
      terminalOutput: r.terminalOutput,
      severities: r.verdict.findings.map((f) => f.severity),
      integrityAltered: r.integrityReport?.altered ?? -1,
      integrityExamined: r.integrityReport?.examined ?? -1,
    };
  }

  it('DOWNGRADES a fabricated LLM critical so it no longer blocks the gate', async () => {
    const r = await runCi(fabricatedVerdict);
    expect(r.severities).toEqual(['suggestion']);
    expect(r.assessment).toBe('approve');
    expect(r.exitCode).toBe(0);
    expect(r.integrityExamined).toBe(1);
    expect(r.integrityAltered).toBe(1);
    expect(r.terminalOutput).toContain('finding integrity: examined 1 finding(s)');
  });

  it('lets a legitimate LLM critical through and keeps the gate red', async () => {
    const r = await runCi(legitimateVerdict);
    expect(r.severities).toEqual(['critical']);
    expect(r.assessment).toBe('request-changes');
    expect(r.exitCode).toBe(1);
    expect(r.integrityExamined).toBe(1);
    expect(r.integrityAltered).toBe(0);
  });
});
