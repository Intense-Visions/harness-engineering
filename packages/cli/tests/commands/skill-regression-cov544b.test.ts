import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  SkillRegressionFixture,
  SkillRegressionVerdict,
} from '@harness-engineering/intelligence';
import {
  loadFixtures,
  resolveCandidates,
  deriveExitCode,
  buildSkillRegressionBody,
  runSkillRegression,
  createSkillRegressionCommand,
  type LoadedFixture,
  type SkillRegressionEvaluatorLike,
  type SkillRegressionResult,
} from '../../src/commands/skill-regression';
import { logger } from '../../src/output/logger';

function makeFixture(over: Partial<SkillRegressionFixture> = {}): SkillRegressionFixture {
  return {
    schemaVersion: 1,
    skill: 'harness-spec-craft',
    id: 'fx1',
    input: 'in',
    rubric: [{ id: 'c1', criterion: 'is good' }],
    referenceOutput: 'ref',
    baseline: { score: 0.9, k: 1, tolerance: 0.1 },
    ...over,
  };
}

function verdict(over: Partial<SkillRegressionVerdict> = {}): SkillRegressionVerdict {
  return {
    verdict: 'STABLE',
    confidence: 'high',
    score: 0.9,
    baselineScore: 0.9,
    delta: 0,
    tolerance: 0.1,
    sampledK: 1,
    rationale: 'ok',
    authority: 'advisory',
    ...over,
  };
}

describe('skill-regression pure helpers (cov544b)', () => {
  describe('deriveExitCode', () => {
    it('returns 0 when not blocking on regressed', () => {
      expect(deriveExitCode([verdict({ authority: 'blocking' })], 'none')).toBe(0);
    });
    it('returns 1 when blocking-on-regressed and a verdict is blocking', () => {
      expect(deriveExitCode([verdict({ authority: 'blocking' })], 'regressed')).toBe(1);
    });
    it('returns 0 when blocking-on-regressed but no blocking verdicts', () => {
      expect(deriveExitCode([verdict({ authority: 'advisory' })], 'regressed')).toBe(0);
    });
  });

  describe('buildSkillRegressionBody', () => {
    it('renders the empty (➖) body when there are no verdicts', () => {
      const body = buildSkillRegressionBody({ verdicts: [], exitCode: 0 });
      expect(body).toContain('➖');
      expect(body).toContain('No golden fixtures found');
    });
    it('renders a ✅ table for non-blocking verdicts', () => {
      const result: SkillRegressionResult = {
        verdicts: [{ fixture: makeFixture(), verdict: verdict() }],
        exitCode: 0,
      };
      const body = buildSkillRegressionBody(result);
      expect(body).toContain('✅');
      expect(body).toContain('| harness-spec-craft | fx1 | STABLE |');
    });
    it('renders a 🛑 header when a verdict is blocking', () => {
      const result: SkillRegressionResult = {
        verdicts: [
          {
            fixture: makeFixture(),
            verdict: verdict({ verdict: 'REGRESSED', authority: 'blocking' }),
          },
        ],
        exitCode: 1,
      };
      expect(buildSkillRegressionBody(result)).toContain('🛑');
    });
  });

  describe('loadFixtures', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-load-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('returns [] for a missing directory', () => {
      expect(loadFixtures(path.join(dir, 'nope'), (r) => r as SkillRegressionFixture)).toEqual([]);
    });

    it('returns [] when the path is a file (readdir throws)', () => {
      const file = path.join(dir, 'afile');
      fs.writeFileSync(file, 'x');
      expect(loadFixtures(file, (r) => r as SkillRegressionFixture)).toEqual([]);
    });

    it('loads + sorts *.json fixtures and skips an unparseable one with a warning', () => {
      const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ id: 'b' }));
      fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ id: 'a' }));
      fs.writeFileSync(path.join(dir, 'bad.json'), '{ not json');
      fs.writeFileSync(path.join(dir, 'ignore.txt'), 'nope');
      const loaded = loadFixtures(dir, (raw) => raw as SkillRegressionFixture);
      // sorted a.json before b.json; bad.json warned + skipped; .txt ignored
      expect(loaded.map((l) => (l.fixture as { id: string }).id)).toEqual(['a', 'b']);
      expect(warnSpy.mock.calls.join(' ')).toContain('unparseable fixture bad.json');
      warnSpy.mockRestore();
    });
  });

  describe('resolveCandidates', () => {
    let dir: string;
    const fixture = makeFixture({ skill: 'sk', id: 'id1' });
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cand-'));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('returns [] when no candidateDir is given', () => {
      expect(resolveCandidates(fixture, undefined)).toEqual([]);
    });
    it('returns [] when candidateDir does not exist', () => {
      expect(resolveCandidates(fixture, path.join(dir, 'missing'))).toEqual([]);
    });
    it('matches <prefix>.txt and <prefix>.<n>.txt but not stray siblings', () => {
      fs.writeFileSync(path.join(dir, 'sk__id1.txt'), 'A');
      fs.writeFileSync(path.join(dir, 'sk__id1.2.txt'), 'B');
      fs.writeFileSync(path.join(dir, 'sk__id1.backup.txt'), 'SKIP');
      fs.writeFileSync(path.join(dir, 'other.txt'), 'SKIP2');
      const out = resolveCandidates(fixture, dir);
      expect(out.sort()).toEqual(['A', 'B']);
    });
    it('skips an unreadable candidate but still returns the readable ones', () => {
      fs.writeFileSync(path.join(dir, 'sk__id1.txt'), 'A');
      const read = (p: string): string => {
        if (p.endsWith('sk__id1.2.txt')) throw new Error('unreadable');
        return fs.readFileSync(p, 'utf-8');
      };
      const list = (): string[] => ['sk__id1.txt', 'sk__id1.2.txt'];
      const out = resolveCandidates(fixture, dir, read, list);
      expect(out).toEqual(['A']);
    });
    it('returns [] when listing throws', () => {
      const list = (): string[] => {
        throw new Error('boom');
      };
      expect(resolveCandidates(fixture, dir, (p) => p, list)).toEqual([]);
    });
  });
});

describe('runSkillRegression with injected seams (cov544b)', () => {
  const fixture = makeFixture();
  const loaded: LoadedFixture[] = [{ fixture, filePath: '/tmp/fx1.json' }];

  it('emits a no-provider advisory verdict for each fixture when there is no evaluator', async () => {
    const result = await runSkillRegression({
      fixturesDir: '/abs/fixtures',
      loadFixtures: () => loaded,
      makeEvaluator: async () => null,
    });
    expect(result.exitCode).toBe(0);
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.verdict.verdict).toBe('INCONCLUSIVE');
    expect(result.verdicts[0]!.verdict.authority).toBe('advisory');
  });

  it('scores each fixture through the evaluator and passes resolved candidates', async () => {
    const evaluate = vi.fn(async () => verdict());
    const evaluator: SkillRegressionEvaluatorLike = { evaluate };
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      loadFixtures: () => loaded,
      makeEvaluator: async () => evaluator,
      resolveCandidates: () => ['cand-a', 'cand-b'],
    });
    expect(result.verdicts[0]!.verdict.verdict).toBe('STABLE');
    expect(evaluate).toHaveBeenCalledWith({
      fixture,
      candidates: ['cand-a', 'cand-b'],
    });
  });

  it('omits the candidates key when none resolve (self-test path)', async () => {
    const evaluate = vi.fn(async () => verdict());
    await runSkillRegression({
      fixturesDir: '/abs',
      loadFixtures: () => loaded,
      makeEvaluator: async () => ({ evaluate }),
      resolveCandidates: () => [],
    });
    expect(evaluate).toHaveBeenCalledWith({ fixture });
  });

  it('degrades to a no-provider verdict when the evaluator throws', async () => {
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      loadFixtures: () => loaded,
      makeEvaluator: async () => ({
        evaluate: async () => {
          throw new Error('provider exploded');
        },
      }),
    });
    expect(result.verdicts[0]!.verdict.verdict).toBe('INCONCLUSIVE');
    expect(result.exitCode).toBe(0);
  });

  it('filters fixtures by --skill', async () => {
    const two: LoadedFixture[] = [
      { fixture: makeFixture({ skill: 'keep', id: 'a' }), filePath: 'a' },
      { fixture: makeFixture({ skill: 'drop', id: 'b' }), filePath: 'b' },
    ];
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      skill: 'keep',
      loadFixtures: () => two,
      makeEvaluator: async () => ({ evaluate: async () => verdict() }),
      resolveCandidates: () => [],
    });
    expect(result.verdicts).toHaveLength(1);
    expect(result.verdicts[0]!.fixture.skill).toBe('keep');
  });

  it('blocks (exit 1) when block-on regressed and a verdict is blocking', async () => {
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      blockOn: 'regressed',
      loadFixtures: () => loaded,
      makeEvaluator: async () => ({
        evaluate: async () => verdict({ verdict: 'REGRESSED', authority: 'blocking' }),
      }),
      resolveCandidates: () => [],
    });
    expect(result.exitCode).toBe(1);
  });

  it('under --update-baseline rewrites the baseline and evaluates the updated fixture', async () => {
    const writeFixture = vi.fn();
    // Evaluator: first call = baseline re-score (STABLE, score 0.5), second = eval.
    const evaluate = vi
      .fn<SkillRegressionEvaluatorLike['evaluate']>()
      .mockResolvedValueOnce(verdict({ verdict: 'STABLE', score: 0.5 }))
      .mockResolvedValueOnce(verdict());
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      updateBaseline: true,
      loadFixtures: () => loaded,
      makeEvaluator: async () => ({ evaluate }),
      resolveCandidates: () => [],
      writeFixture,
    });
    expect(writeFixture).toHaveBeenCalledTimes(1);
    const written = writeFixture.mock.calls[0]![1] as SkillRegressionFixture;
    expect(written.baseline.score).toBe(0.5);
    // The evaluated fixture carries the freshly-written baseline.
    expect(result.verdicts[0]!.fixture.baseline.score).toBe(0.5);
  });

  it('under --update-baseline an INCONCLUSIVE re-score leaves the baseline untouched (warns, no write)', async () => {
    const writeFixture = vi.fn();
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const evaluate = vi
      .fn<SkillRegressionEvaluatorLike['evaluate']>()
      .mockResolvedValueOnce(verdict({ verdict: 'INCONCLUSIVE' }))
      .mockResolvedValueOnce(verdict());
    const result = await runSkillRegression({
      fixturesDir: '/abs',
      updateBaseline: true,
      loadFixtures: () => loaded,
      makeEvaluator: async () => ({ evaluate }),
      resolveCandidates: () => [],
      writeFixture,
    });
    expect(writeFixture).not.toHaveBeenCalled();
    expect(warnSpy.mock.calls.join(' ')).toContain('not updated (inconclusive)');
    expect(result.verdicts[0]!.fixture.baseline.score).toBe(0.9); // unchanged
    warnSpy.mockRestore();
  });
});

describe('skill-regression command action (cov544b)', () => {
  let tmp: string;
  let out: string[];
  let exitCode: number | null;
  let spies: Array<{ mockRestore: () => void }>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-cmd-'));
    out = [];
    exitCode = null;
    spies = [
      vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
        out.push(String(s));
        return true;
      }) as never),
      vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        exitCode = c ?? 0;
        throw new Error(`__exit__:${exitCode}`);
      }) as never),
    ];
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  async function run(args: string[]) {
    try {
      await createSkillRegressionCommand().parseAsync(args, { from: 'user' });
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith('__exit__')) throw e;
    }
  }

  it('prints the Markdown body and exits 0 when the fixtures dir is empty', async () => {
    // Empty dir => zero fixtures => no evaluator/provider needed.
    await run(['--fixtures', tmp]);
    expect(exitCode).toBe(0);
    expect(out.join('')).toContain('harness skill-regression');
    expect(out.join('')).toContain('No golden fixtures found');
  });

  it('writes the verdicts JSON artifact to --out', async () => {
    const outPath = path.join(tmp, 'verdicts.json');
    await run(['--fixtures', tmp, '--out', outPath]);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(outPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(outPath, 'utf-8'))).toEqual([]);
  });
});
