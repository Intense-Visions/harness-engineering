import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { Command, Option } from 'commander';
import type {
  SkillRegressionFixture,
  SkillRegressionVerdict,
} from '@harness-engineering/intelligence';
import { resolveAnalysisProvider } from '../mcp/utils/analysis-provider';
import { logger } from '../output/logger';

/**
 * `harness skill-regression` — the golden-fixture skill-regression gate. For
 * each golden fixture (a canonical input + a quality rubric + a recorded golden
 * baseline score for one skill), it scores one or more candidate outputs of the
 * skill semantically against the rubric (an LLM rules each criterion; TypeScript
 * computes the score) and compares the aggregate score@k to the golden baseline.
 * A skill whose output quality drops below `baseline.score - tolerance` has
 * REGRESSED.
 *
 * Ship authority is DERIVED in TypeScript from (verdict, confidence) — never
 * read from the LLM. The gate blocks (exit 1) iff `--block-on regressed` (the
 * default) and any fixture verdict is `blocking` (a high-confidence REGRESSED);
 * every other verdict is advisory and exits 0. The whole path is degrade-safe:
 * a missing provider, a missing fixtures dir, or a malformed payload resolves to
 * an INCONCLUSIVE/advisory verdict and exit 0 — it never blocks on noise.
 *
 * `--update-baseline` re-scores each fixture's golden reference output and
 * rewrites the fixture's `baseline.score` in byte-stable JSON, so a re-run that
 * changes nothing produces a no-op diff.
 */

export type SkillRegressionBlockOn = 'regressed' | 'none';
export const SKILL_REGRESSION_BLOCK_ON: SkillRegressionBlockOn[] = ['regressed', 'none'];

/** Default location for golden fixtures, relative to the project root. */
export const DEFAULT_FIXTURES_DIR = 'fixtures/skill-regression';

/** The evaluator seam — the subset of `SkillRegressionEvaluator` this command drives. */
export interface SkillRegressionEvaluatorLike {
  evaluate(input: {
    fixture: SkillRegressionFixture;
    candidates?: string[];
  }): Promise<SkillRegressionVerdict>;
}

/** A loaded fixture plus its source path (for `--update-baseline` write-back). */
export interface LoadedFixture {
  fixture: SkillRegressionFixture;
  filePath: string;
}

/**
 * Load + validate every `*.json` fixture in `dir`. Degrade-safe: a missing dir
 * yields `[]`; a single malformed fixture is skipped with a warning rather than
 * failing the whole run. Sorted by file path for deterministic iteration.
 */
export function loadFixtures(
  dir: string,
  parse: (raw: unknown) => SkillRegressionFixture
): LoadedFixture[] {
  if (!existsSync(dir)) return [];
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const loaded: LoadedFixture[] = [];
  for (const name of names.sort()) {
    const filePath = path.join(dir, name);
    try {
      loaded.push({ fixture: parse(JSON.parse(readFileSync(filePath, 'utf-8'))), filePath });
    } catch {
      logger.warn(`skill-regression: skipping unparseable fixture ${name}`);
    }
  }
  return loaded;
}

/**
 * Resolve the candidate outputs to score for one fixture. Looks in
 * `candidateDir` for files named `<skill>__<id>.txt` or `<skill>__<id>.<n>.txt`
 * (the k samples), sorted. When none are found (or no dir given), returns `[]`
 * so the evaluator self-tests against the fixture's golden reference output.
 */
export function resolveCandidates(
  fixture: SkillRegressionFixture,
  candidateDir: string | undefined,
  read: (p: string) => string = (p) => readFileSync(p, 'utf-8'),
  list: (d: string) => string[] = (d) => readdirSync(d)
): string[] {
  if (!candidateDir || !existsSync(candidateDir)) return [];
  const prefix = `${fixture.skill}__${fixture.id}`;
  let names: string[];
  try {
    names = list(candidateDir).filter(
      (n) => n === `${prefix}.txt` || (n.startsWith(`${prefix}.`) && n.endsWith('.txt'))
    );
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of names.sort()) {
    try {
      out.push(read(path.join(candidateDir, name)));
    } catch {
      // skip an unreadable candidate; the remaining samples still score.
    }
  }
  return out;
}

export interface SkillRegressionResult {
  verdicts: Array<{ fixture: SkillRegressionFixture; verdict: SkillRegressionVerdict }>;
  exitCode: number;
}

/** Exit 1 iff blocking on regressions AND at least one verdict is `blocking`. */
export function deriveExitCode(
  verdicts: SkillRegressionVerdict[],
  blockOn: SkillRegressionBlockOn
): number {
  if (blockOn !== 'regressed') return 0;
  return verdicts.some((v) => v.authority === 'blocking') ? 1 : 0;
}

export interface SkillRegressionOptions {
  cwd?: string | undefined;
  fixturesDir?: string | undefined;
  candidateDir?: string | undefined;
  skill?: string | undefined;
  blockOn?: SkillRegressionBlockOn | undefined;
  model?: string | undefined;
  updateBaseline?: boolean | undefined;
  // Injected seams for tests (default to the real implementations):
  loadFixtures?: (dir: string) => LoadedFixture[];
  makeEvaluator?: (model?: string) => Promise<SkillRegressionEvaluatorLike | null>;
  resolveCandidates?: (fixture: SkillRegressionFixture, dir: string | undefined) => string[];
  writeFixture?: (filePath: string, fixture: SkillRegressionFixture) => void;
}

/** Build the real evaluator bound to the resolved analysis provider (or null). */
async function buildEvaluator(model?: string): Promise<SkillRegressionEvaluatorLike | null> {
  const { SkillRegressionEvaluator } = await import('@harness-engineering/intelligence');
  const provider = await resolveAnalysisProvider(model);
  if (!provider) return null;
  return new SkillRegressionEvaluator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    provider as any,
    model !== undefined ? { model } : {}
  ) as unknown as SkillRegressionEvaluatorLike;
}

/** The advisory verdict used when there is no provider to judge with. */
function noProviderVerdict(fixture: SkillRegressionFixture): SkillRegressionVerdict {
  return {
    verdict: 'INCONCLUSIVE',
    confidence: 'low',
    score: 0,
    baselineScore: fixture.baseline.score,
    delta: 0,
    tolerance: fixture.baseline.tolerance,
    sampledK: 0,
    rationale:
      'No analysis provider configured (set ANTHROPIC_API_KEY or HARNESS_ANALYSIS_BASE_URL); ' +
      'the skill-regression gate has nothing to judge with and degrades to an advisory verdict.',
    authority: 'advisory',
  };
}

/**
 * Pure orchestration for `harness skill-regression`: load fixtures, score each
 * against its candidates (or self-test), optionally rewrite baselines, and
 * derive the aggregate exit code. Contains NO `process.exit`. Never throws —
 * every failure degrades to an advisory verdict (exit 0).
 */
export async function runSkillRegression(
  opts: SkillRegressionOptions
): Promise<SkillRegressionResult> {
  const cwd = opts.cwd ?? process.cwd();
  const blockOn = opts.blockOn ?? 'regressed';
  const fixturesDir = path.isAbsolute(opts.fixturesDir ?? DEFAULT_FIXTURES_DIR)
    ? (opts.fixturesDir ?? DEFAULT_FIXTURES_DIR)
    : path.join(cwd, opts.fixturesDir ?? DEFAULT_FIXTURES_DIR);

  const intelligence = await import('@harness-engineering/intelligence');
  const load = opts.loadFixtures ?? ((dir: string) => loadFixtures(dir, intelligence.parseFixture));
  const resolveCand =
    opts.resolveCandidates ??
    ((f: SkillRegressionFixture, dir: string | undefined) => resolveCandidates(f, dir));

  let fixtures = load(fixturesDir);
  if (opts.skill) fixtures = fixtures.filter((f) => f.fixture.skill === opts.skill);

  const makeEvaluator = opts.makeEvaluator ?? buildEvaluator;
  const evaluator = await makeEvaluator(opts.model);

  const verdicts: SkillRegressionResult['verdicts'] = [];
  for (const { fixture, filePath } of fixtures) {
    if (!evaluator) {
      verdicts.push({ fixture, verdict: noProviderVerdict(fixture) });
      continue;
    }
    try {
      if (opts.updateBaseline) {
        await rewriteBaseline(fixture, filePath, evaluator, opts, intelligence);
      }
      const candidates = resolveCand(fixture, opts.candidateDir);
      const verdict = await evaluator.evaluate({
        fixture,
        ...(candidates.length > 0 ? { candidates } : {}),
      });
      verdicts.push({ fixture, verdict });
    } catch {
      verdicts.push({ fixture, verdict: noProviderVerdict(fixture) });
    }
  }

  return {
    verdicts,
    exitCode: deriveExitCode(
      verdicts.map((v) => v.verdict),
      blockOn
    ),
  };
}

/**
 * Re-score a fixture's golden reference output and rewrite its `baseline.score`
 * in byte-stable JSON. A degrade (INCONCLUSIVE) leaves the existing baseline
 * untouched — a bad run never overwrites a good baseline with a degenerate 0.
 */
async function rewriteBaseline(
  fixture: SkillRegressionFixture,
  filePath: string,
  evaluator: SkillRegressionEvaluatorLike,
  opts: SkillRegressionOptions,
  intelligence: typeof import('@harness-engineering/intelligence')
): Promise<void> {
  const verdict = await evaluator.evaluate({ fixture, candidates: [fixture.referenceOutput] });
  if (verdict.verdict === 'INCONCLUSIVE') {
    logger.warn(
      `skill-regression: baseline for ${fixture.skill}/${fixture.id} not updated (inconclusive).`
    );
    return;
  }
  const updated: SkillRegressionFixture = {
    ...fixture,
    baseline: { ...fixture.baseline, score: verdict.score, k: 1 },
  };
  const write =
    opts.writeFixture ??
    ((p: string, f: SkillRegressionFixture) => writeFileSync(p, intelligence.serializeFixture(f)));
  write(filePath, updated);
}

/** Render the per-fixture verdicts as a Markdown summary. Pure (no I/O). */
export function buildSkillRegressionBody(result: SkillRegressionResult): string {
  const anyBlocking = result.verdicts.some((v) => v.verdict.authority === 'blocking');
  const icon = anyBlocking ? '🛑' : result.verdicts.length === 0 ? '➖' : '✅';
  const out: string[] = [`## ${icon} harness skill-regression`, ''];
  if (result.verdicts.length === 0) {
    out.push('No golden fixtures found. Nothing to evaluate.');
  } else {
    out.push('| Skill | Fixture | Verdict | Score | Baseline | Authority |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const { fixture, verdict } of result.verdicts) {
      out.push(
        `| ${fixture.skill} | ${fixture.id} | ${verdict.verdict} | ${verdict.score.toFixed(3)} | ` +
          `${verdict.baselineScore.toFixed(3)} | ${verdict.authority} |`
      );
    }
  }
  out.push(
    '',
    '<sub>Posted by `harness skill-regression`. Ship authority is derived in TypeScript ' +
      'from (verdict, confidence); a high-confidence REGRESSED blocks. The exit code is authoritative.</sub>'
  );
  return out.join('\n');
}

/** Build the top-level `harness skill-regression` command. */
export function createSkillRegressionCommand(): Command {
  return new Command('skill-regression')
    .description(
      'Run the golden-fixture skill-regression gate: score candidate skill outputs against ' +
        'per-skill rubrics and block (exit 1) only on a high-confidence quality regression'
    )
    .option('--fixtures <dir>', `golden fixtures directory (default: ${DEFAULT_FIXTURES_DIR})`)
    .option('--candidate <dir>', 'directory of captured candidate outputs (default: self-test)')
    .option('--skill <name>', 'only evaluate fixtures for this skill')
    .addOption(
      new Option('--block-on <level>', SKILL_REGRESSION_BLOCK_ON.join(' | '))
        .choices(SKILL_REGRESSION_BLOCK_ON)
        .default('regressed')
    )
    .option('--update-baseline', 're-score golden reference outputs and rewrite fixture baselines')
    .option('--model <model>', 'model override for the judge LLM call')
    .option('--out <path>', 'write the verdicts JSON artifact to a file')
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const result = await runSkillRegression({
        fixturesDir: opts.fixtures as string | undefined,
        candidateDir: opts.candidate as string | undefined,
        skill: opts.skill as string | undefined,
        blockOn: opts.blockOn as SkillRegressionBlockOn | undefined,
        model: opts.model as string | undefined,
        updateBaseline: opts.updateBaseline as boolean | undefined,
      });
      const streamJson = cmd.optsWithGlobals().json === true;
      const serialized = JSON.stringify(
        result.verdicts.map((v) => ({
          skill: v.fixture.skill,
          id: v.fixture.id,
          verdict: v.verdict,
        })),
        null,
        2
      );
      if (!streamJson) process.stdout.write(buildSkillRegressionBody(result) + '\n');
      if (typeof opts.out === 'string') writeFileSync(opts.out, serialized);
      else if (streamJson) process.stdout.write(serialized + '\n');
      process.exit(result.exitCode);
    });
}
