import { describe, it, expect } from 'vitest';
import type {
  SkillRegressionFixture,
  SkillRegressionVerdict,
} from '@harness-engineering/intelligence';
import {
  runSkillRegression,
  deriveExitCode,
  buildSkillRegressionBody,
  resolveCandidates,
  type LoadedFixture,
  type SkillRegressionEvaluatorLike,
} from './skill-regression';

/**
 * Command-layer contract for `harness skill-regression`. The scoring/authority
 * logic is covered in the intelligence package; here we pin the orchestration:
 * fixtures → verdicts → gate exit code, with injected fixture-loader and
 * evaluator seams so no filesystem or LLM is touched.
 */

const FIXTURE: SkillRegressionFixture = {
  schemaVersion: 1,
  skill: 'harness-spec-craft',
  id: 'minimal-adr',
  input: 'write an ADR',
  rubric: [{ id: 'a', criterion: 'states a decision' }],
  referenceOutput: 'a good ADR',
  baseline: { score: 1, k: 1, tolerance: 0.25 },
};

function loaded(fixtures: SkillRegressionFixture[]): LoadedFixture[] {
  return fixtures.map((f, i) => ({
    fixture: f,
    filePath: `/fixtures/${f.skill}__${f.id}-${i}.json`,
  }));
}

/** An evaluator that returns a fixed verdict shape, filling defaults from the fixture. */
function stubEvaluator(v: Partial<SkillRegressionVerdict>): SkillRegressionEvaluatorLike {
  return {
    async evaluate({ fixture }) {
      return {
        verdict: 'STABLE',
        confidence: 'high',
        score: 1,
        baselineScore: fixture.baseline.score,
        delta: 0,
        tolerance: fixture.baseline.tolerance,
        sampledK: 1,
        rationale: 'stub',
        authority: 'advisory',
        ...v,
      };
    },
  };
}

describe('deriveExitCode', () => {
  const blocking: SkillRegressionVerdict = {
    verdict: 'REGRESSED',
    confidence: 'high',
    score: 0.5,
    baselineScore: 1,
    delta: 0.5,
    tolerance: 0.25,
    sampledK: 1,
    rationale: '',
    authority: 'blocking',
  };
  const advisory: SkillRegressionVerdict = {
    ...blocking,
    confidence: 'low',
    authority: 'advisory',
  };

  it('exits 1 when a blocking verdict is present and blocking on regressions', () => {
    expect(deriveExitCode([advisory, blocking], 'regressed')).toBe(1);
  });
  it('exits 0 when all verdicts are advisory', () => {
    expect(deriveExitCode([advisory, advisory], 'regressed')).toBe(0);
  });
  it('exits 0 under --block-on none even with a blocking verdict', () => {
    expect(deriveExitCode([blocking], 'none')).toBe(0);
  });
});

describe('runSkillRegression', () => {
  it('self-test STABLE across fixtures → exit 0', async () => {
    const result = await runSkillRegression({
      loadFixtures: () => loaded([FIXTURE]),
      makeEvaluator: async () => stubEvaluator({ verdict: 'STABLE', authority: 'advisory' }),
      resolveCandidates: () => [],
    });
    expect(result.exitCode).toBe(0);
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.verdict.verdict).toBe('STABLE');
  });

  it('a blocking regression under --block-on regressed → exit 1', async () => {
    const result = await runSkillRegression({
      blockOn: 'regressed',
      loadFixtures: () => loaded([FIXTURE]),
      makeEvaluator: async () =>
        stubEvaluator({ verdict: 'REGRESSED', authority: 'blocking', score: 0.5 }),
      resolveCandidates: () => ['weak output'],
    });
    expect(result.exitCode).toBe(1);
  });

  it('ships advisory-first: a blocking regression exits 0 under the default gate', async () => {
    const result = await runSkillRegression({
      // no blockOn → the shipped default is advisory (`none`)
      loadFixtures: () => loaded([FIXTURE]),
      makeEvaluator: async () =>
        stubEvaluator({ verdict: 'REGRESSED', authority: 'blocking', score: 0.5 }),
      resolveCandidates: () => ['weak output'],
    });
    expect(result.exitCode).toBe(0);
    expect(result.verdicts[0]!.verdict.authority).toBe('blocking');
  });

  it('degrades to advisory INCONCLUSIVE (exit 0) when no provider is configured', async () => {
    const result = await runSkillRegression({
      loadFixtures: () => loaded([FIXTURE]),
      makeEvaluator: async () => null,
      resolveCandidates: () => [],
    });
    expect(result.exitCode).toBe(0);
    expect(result.verdicts[0]!.verdict.verdict).toBe('INCONCLUSIVE');
    expect(result.verdicts[0]!.verdict.authority).toBe('advisory');
  });

  it('filters by --skill', async () => {
    const other: SkillRegressionFixture = { ...FIXTURE, skill: 'harness-copy-craft', id: 'err' };
    const result = await runSkillRegression({
      skill: 'harness-copy-craft',
      loadFixtures: () => loaded([FIXTURE, other]),
      makeEvaluator: async () => stubEvaluator({}),
      resolveCandidates: () => [],
    });
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.fixture.skill).toBe('harness-copy-craft');
  });

  it('--update-baseline rewrites the fixture with the re-scored baseline', async () => {
    const writes: Array<{ path: string; fixture: SkillRegressionFixture }> = [];
    const result = await runSkillRegression({
      updateBaseline: true,
      loadFixtures: () => loaded([{ ...FIXTURE, baseline: { score: 0.4, k: 1, tolerance: 0.25 } }]),
      makeEvaluator: async () =>
        stubEvaluator({ verdict: 'STABLE', score: 1, authority: 'advisory' }),
      resolveCandidates: () => [],
      writeFixture: (path, fixture) => writes.push({ path, fixture }),
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.fixture.baseline.score).toBe(1);
    // The reported verdict must reflect the freshly-written baseline, not the
    // stale 0.4 the fixture was loaded with (stale-in-memory-baseline fix).
    expect(result.verdicts[0]!.verdict.baselineScore).toBe(1);
    expect(result.verdicts[0]!.fixture.baseline.score).toBe(1);
  });

  it('--update-baseline rounds the recorded score to 3dp', async () => {
    const writes: Array<{ path: string; fixture: SkillRegressionFixture }> = [];
    await runSkillRegression({
      updateBaseline: true,
      loadFixtures: () => loaded([FIXTURE]),
      makeEvaluator: async () =>
        stubEvaluator({ verdict: 'STABLE', score: 0.6666666666, authority: 'advisory' }),
      resolveCandidates: () => [],
      writeFixture: (path, fixture) => writes.push({ path, fixture }),
    });
    expect(writes[0]!.fixture.baseline.score).toBe(0.667);
  });

  it('empty fixtures → exit 0 with an empty verdict set', async () => {
    const result = await runSkillRegression({
      loadFixtures: () => [],
      makeEvaluator: async () => stubEvaluator({}),
    });
    expect(result).toEqual({ verdicts: [], exitCode: 0 });
  });
});

describe('resolveCandidates', () => {
  const prefix = `${FIXTURE.skill}__${FIXTURE.id}`;

  it('matches <prefix>.txt and <prefix>.<digits>.txt but excludes stray siblings', () => {
    const files = [
      `${prefix}.txt`,
      `${prefix}.1.txt`,
      `${prefix}.2.txt`,
      `${prefix}.backup.txt`, // non-digit middle segment — excluded
      `${prefix}.1a.txt`, // non-digit middle segment — excluded
      `${prefix}.txt.bak`, // wrong extension — excluded
      `${prefix}extra.txt`, // no dot after prefix — excluded
      'other-skill__other-id.txt', // different fixture — excluded
    ];
    // candidateDir '.' exists so the existsSync guard passes; the list/read
    // seams keep the match purely in-memory (read echoes the file name).
    const out = resolveCandidates(
      FIXTURE,
      '.',
      (p) => p,
      () => files
    );
    expect(out).toEqual([`${prefix}.1.txt`, `${prefix}.2.txt`, `${prefix}.txt`]);
  });
});

describe('buildSkillRegressionBody', () => {
  it('renders a no-fixtures notice', () => {
    expect(buildSkillRegressionBody({ verdicts: [], exitCode: 0 })).toContain('No golden fixtures');
  });

  it('renders a table row per fixture and a blocking icon when one blocks', () => {
    const body = buildSkillRegressionBody({
      verdicts: [
        {
          fixture: FIXTURE,
          verdict: {
            verdict: 'REGRESSED',
            confidence: 'high',
            score: 0.5,
            baselineScore: 1,
            delta: 0.5,
            tolerance: 0.25,
            sampledK: 1,
            rationale: '',
            authority: 'blocking',
          },
        },
      ],
      exitCode: 1,
    });
    expect(body).toContain('harness-spec-craft');
    expect(body).toContain('REGRESSED');
    expect(body).toContain('🛑');
  });
});
