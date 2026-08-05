import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Command, Option } from 'commander';
import type { OutcomeVerdict } from '@harness-engineering/intelligence';
import { resolveAnalysisProvider } from '../mcp/utils/analysis-provider';
import { resolveDiffRange, type RunGit } from './review-ci';
import { logger } from '../output/logger';

/**
 * `harness outcome-eval-ci` — the headless, CI-runnable surface of the
 * post-execution spec-satisfaction gate (outcome-eval). It is to `outcome_eval`
 * what `review-ci` is to the interactive review skill: it resolves the change
 * (spec + diff + test output), runs the intelligence-package `OutcomeEvaluator`,
 * persists the `execution_outcome` node to the project graph (so a sha-keyed
 * consumer such as the pre-merge brief can look the verdict up), and turns the
 * TS-DERIVED ship authority into a process exit code.
 *
 * Authority is NEVER read from the LLM — the evaluator computes it via
 * `deriveAuthority(verdict, confidence)` and this command only reads
 * `verdict.authority`. The gate blocks (exit 1) iff `--block-on blocking`
 * (the default) and `authority === 'blocking'` (a high-confidence
 * NOT_SATISFIED); every other verdict is advisory and exits 0. The whole path
 * is degrade-safe: a missing spec, missing provider, empty diff, or persistence
 * failure resolves to an INCONCLUSIVE/advisory verdict and exit 0 — it never
 * throws and never blocks on infrastructure noise.
 */

/** The valid `--block-on` levels: block on a blocking verdict, or never. */
export type OutcomeBlockOn = 'blocking' | 'none';
export const OUTCOME_BLOCK_ON_LEVELS: OutcomeBlockOn[] = ['blocking', 'none'];

const defaultRunGit: RunGit = (args) =>
  execFileSync('git', args, { encoding: 'utf-8' }).toString().trim();

/** The evaluator seam — the subset of `OutcomeEvaluator` this command drives. */
export interface OutcomeEvaluatorLike {
  evaluate(input: {
    specPath: string;
    diff: string;
    testOutput: string;
    commit?: string;
  }): Promise<OutcomeVerdict>;
}

/**
 * Resolve the spec path to judge against.
 *
 * - An explicit `--spec` is used verbatim.
 * - Otherwise, auto-discover a `docs/changes/<slug>/proposal.md` among the
 *   files changed in the diff range (the harness's own change-spec convention).
 *   The first match wins.
 * - Returns `undefined` when no spec can be resolved — the degradation path
 *   (an advisory INCONCLUSIVE verdict; the gate never blocks a spec-less PR).
 */
export function resolveSpecPath(opts: {
  specPath?: string | undefined;
  range: string;
  cwd: string;
  runGit: RunGit;
}): string | undefined {
  if (opts.specPath) return opts.specPath;
  let names: string[];
  try {
    names = opts.runGit(['diff', '--name-only', opts.range]).split('\n');
  } catch {
    return undefined;
  }
  const match = names
    .map((n) => n.trim())
    .find((n) => /^docs\/changes\/[^/]+\/proposal\.md$/.test(n));
  return match ? path.join(opts.cwd, match) : undefined;
}

/**
 * The degradation verdict used when there is nothing judgable (no spec). It is
 * INCONCLUSIVE/low → advisory via the SAME authority rule the evaluator uses,
 * so the gate can never block a change that carries no spec.
 */
function noSpecVerdict(): OutcomeVerdict {
  return {
    verdict: 'INCONCLUSIVE',
    confidence: 'low',
    rationale:
      'No spec (docs/changes/<slug>/proposal.md) was found for this change; ' +
      'the outcome gate has nothing judgable and degrades to an advisory verdict.',
    judgedAgainst: 'overview',
    unmetCriteria: [],
    authority: 'advisory',
  };
}

/**
 * Build the real `OutcomeEvaluator` bound to the project graph store, returning
 * BOTH the evaluator and the store so the caller can persist the store after
 * evaluation without reaching into a private field.
 */
async function buildEvaluator(
  cwd: string,
  model?: string
): Promise<{ evaluator: OutcomeEvaluatorLike; store: unknown }> {
  const { OutcomeEvaluator } = await import('@harness-engineering/intelligence');
  const { GraphStore } = await import('@harness-engineering/graph');
  const provider = await resolveAnalysisProvider(model);
  const store = new GraphStore();
  // Load the existing graph so persistence is additive; a missing graph leaves
  // the store empty (the outcome node is still written and saved below).
  try {
    await store.load(path.join(cwd, '.harness', 'graph'));
  } catch {
    // degrade-safe: an unloadable graph is treated as empty.
  }
  const evaluator = new OutcomeEvaluator(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (provider ?? unconfiguredProvider()) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store as any,
    model !== undefined ? { model } : {}
  ) as unknown as OutcomeEvaluatorLike;
  return { evaluator, store };
}

/**
 * A provider whose analyze() always rejects — used only when no real provider
 * is configured, so the evaluator degrades to INCONCLUSIVE/advisory rather than
 * throwing. Mirrors the MCP tool's degrade seam.
 */
function unconfiguredProvider(): { analyze: () => Promise<never> } {
  return {
    analyze: () =>
      Promise.reject(
        new Error('No analysis provider configured (set ANTHROPIC_API_KEY). Degrading.')
      ),
  };
}

/**
 * Persist the graph store to `.harness/graph` so the freshly-written
 * execution_outcome node survives for a later reader (e.g. the pre-merge
 * brief). Degrade-safe: a save failure is logged and swallowed — the verdict
 * (and the gate) are unaffected.
 */
async function persistGraph(store: unknown, cwd: string): Promise<void> {
  const maybe = store as { save?: (dir: string) => Promise<void> };
  if (typeof maybe.save !== 'function') return;
  try {
    await maybe.save(path.join(cwd, '.harness', 'graph'));
  } catch {
    logger.warn('outcome-eval-ci: graph persistence failed; the verdict above is unaffected.');
  }
}

export interface OutcomeEvalCiOptions {
  cwd?: string | undefined;
  specPath?: string | undefined;
  diffRange?: string | undefined;
  testOutputPath?: string | undefined;
  blockOn?: OutcomeBlockOn | undefined;
  model?: string | undefined;
  commit?: string | undefined;
  // Injected seams for tests (default to the real implementations):
  runGit?: RunGit;
  resolveRaw?: (range: string, cwd: string, runGit: RunGit) => string;
  readTestOutput?: (p: string) => string;
  /** Provide an evaluator + its store directly (tests); else the real one is built. */
  makeEvaluator?: (cwd: string, model?: string) => Promise<OutcomeEvaluatorLike>;
  /** The store to persist after evaluation (tests); real path saves the graph. */
  store?: unknown;
}

export interface OutcomeEvalCiResult {
  verdict: OutcomeVerdict;
  exitCode: number;
}

/**
 * Map a verdict + `--block-on` level to the gate exit code. Pure: the ONLY
 * place the TS-derived authority becomes a pass/fail decision.
 */
export function deriveExitCode(verdict: OutcomeVerdict, blockOn: OutcomeBlockOn): number {
  return blockOn === 'blocking' && verdict.authority === 'blocking' ? 1 : 0;
}

/** Resolve the raw diff for the range; degrade-safe ('' on any failure). */
function resolveDiff(
  opts: OutcomeEvalCiOptions,
  range: string,
  cwd: string,
  runGit: RunGit
): string {
  const resolveRaw = opts.resolveRaw ?? ((r, _c, g) => g(['diff', r]));
  try {
    return resolveRaw(range, cwd, runGit);
  } catch {
    return '';
  }
}

/** Read captured test output from the given path; degrade-safe ('' otherwise). */
function resolveTestOutput(opts: OutcomeEvalCiOptions): string {
  if (!opts.testOutputPath) return '';
  try {
    return (opts.readTestOutput ?? ((p) => readFileSync(p, 'utf-8')))(opts.testOutputPath);
  } catch {
    return '';
  }
}

/** Build the evaluator + the store to persist, honoring the test seams. */
async function resolveEvaluator(
  opts: OutcomeEvalCiOptions,
  cwd: string
): Promise<{ evaluator: OutcomeEvaluatorLike; store: unknown }> {
  if (opts.makeEvaluator) {
    return { evaluator: await opts.makeEvaluator(cwd, opts.model), store: opts.store };
  }
  return buildEvaluator(cwd, opts.model);
}

/**
 * Pure orchestration for `outcome-eval-ci`: resolve spec + diff + test output,
 * run the evaluator, persist, and derive the exit code. Contains NO
 * `process.exit`, so it stays unit-testable. Never throws — every failure
 * degrades to an advisory verdict (exit 0).
 */
export async function runOutcomeEvalCi(opts: OutcomeEvalCiOptions): Promise<OutcomeEvalCiResult> {
  const cwd = opts.cwd ?? process.cwd();
  const runGit = opts.runGit ?? defaultRunGit;
  const blockOn = opts.blockOn ?? 'blocking';
  const range = resolveDiffRange({
    ...(opts.diffRange ? { range: opts.diffRange } : {}),
    cwd,
    runGit,
  });

  const specPath = resolveSpecPath({ specPath: opts.specPath, range, cwd, runGit });
  if (!specPath) {
    const verdict = noSpecVerdict();
    return { verdict, exitCode: deriveExitCode(verdict, blockOn) };
  }

  const diff = resolveDiff(opts, range, cwd, runGit);
  const testOutput = resolveTestOutput(opts);
  const commit = opts.commit ?? safeHeadSha(runGit);

  try {
    const { evaluator, store } = await resolveEvaluator(opts, cwd);
    const verdict = await evaluator.evaluate({
      specPath,
      diff,
      testOutput,
      ...(commit ? { commit } : {}),
    });
    // Persist the store so the freshly-written execution_outcome node survives
    // for a later reader (e.g. the pre-merge brief). Degrade-safe.
    if (store !== undefined) await persistGraph(store, cwd);
    return { verdict, exitCode: deriveExitCode(verdict, blockOn) };
  } catch {
    // Fail closed on the SAFE side: any unexpected error degrades to advisory.
    return { verdict: noSpecVerdict(), exitCode: 0 };
  }
}

/** Best-effort `git rev-parse HEAD`; undefined on failure (never throws). */
function safeHeadSha(runGit: RunGit): string | undefined {
  try {
    return runGit(['rev-parse', 'HEAD']);
  } catch {
    return undefined;
  }
}

/** Render the verdict as a Markdown PR-comment body. Pure (no I/O). */
export function buildOutcomeBody(verdict: OutcomeVerdict): string {
  const icon =
    verdict.verdict === 'SATISFIED' ? '✅' : verdict.authority === 'blocking' ? '🛑' : '💬';
  const out: string[] = [
    `## ${icon} harness outcome-eval — ${verdict.verdict}`,
    '',
    `**Confidence:** \`${verdict.confidence}\`  •  **Authority:** \`${verdict.authority}\`` +
      `  •  **Judged against:** \`${verdict.judgedAgainst}\``,
  ];
  if (verdict.rationale) out.push('', verdict.rationale);
  if (verdict.unmetCriteria.length) {
    out.push('', '### Unmet criteria', ...verdict.unmetCriteria.map((c) => `- ${c}`));
  }
  out.push(
    '',
    '<sub>Posted by `harness outcome-eval-ci`. Ship authority is derived in TypeScript ' +
      'from (verdict, confidence); a high-confidence NOT_SATISFIED blocks. The exit code is authoritative.</sub>'
  );
  return out.join('\n');
}

/** Seam for delivering the verdict to a PR — real impl shells out to `gh`. */
export type PostOutcome = (verdict: OutcomeVerdict) => void;

const defaultPostOutcome: PostOutcome = (verdict) => {
  execFileSync('gh', ['pr', 'comment', '--body-file', '-'], {
    input: buildOutcomeBody(verdict),
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf-8',
  });
};

/**
 * Emit the result: print the terminal summary (or stream the verdict JSON to
 * stdout when `--json` is set without `--out`), optionally write the JSON
 * artifact, and optionally post it to the PR. No `process.exit` here.
 */
export function emitOutcomeEvalCi(
  result: OutcomeEvalCiResult,
  opts: { jsonPath?: string | boolean | undefined; comment?: boolean | undefined },
  writeFile: (p: string, d: string) => void = (p, d) => writeFileSync(p, d),
  log: (m: string) => void = (m) => process.stdout.write(m + '\n'),
  postOutcome: PostOutcome = defaultPostOutcome
): void {
  const serialized = JSON.stringify(result.verdict, null, 2);
  const jsonToStdout = opts.jsonPath === true;
  if (!jsonToStdout) log(buildOutcomeBody(result.verdict));
  if (typeof opts.jsonPath === 'string') writeFile(opts.jsonPath, serialized);
  else if (jsonToStdout) log(serialized);
  if (opts.comment) {
    try {
      postOutcome(result.verdict);
    } catch (err) {
      logger.warn(
        `outcome-eval-ci: failed to post PR comment (${err instanceof Error ? err.message : String(err)}). ` +
          'The verdict above is authoritative; the exit code still reflects the gate.'
      );
    }
  }
}

/** Build the top-level `harness outcome-eval-ci` command. */
export function createOutcomeEvalCiCommand(): Command {
  return new Command('outcome-eval-ci')
    .description(
      'Run the post-execution spec-satisfaction gate (outcome-eval) for CI: judge the ' +
        'change against its spec and block (exit 1) only on a high-confidence NOT_SATISFIED'
    )
    .option(
      '--spec <path>',
      'spec markdown to judge against (default: auto-discover from the diff)'
    )
    .option('--diff <range>', 'git range (default: origin/<base>...HEAD)')
    .option('--test-output <path>', 'file with captured test-runner output (default: none)')
    .addOption(
      new Option('--block-on <level>', OUTCOME_BLOCK_ON_LEVELS.join(' | '))
        .choices(OUTCOME_BLOCK_ON_LEVELS)
        .default('blocking')
    )
    .option('--model <model>', 'model override for the outcome-eval LLM call')
    .option(
      '--commit <sha>',
      'head sha to stamp on the persisted node (default: git rev-parse HEAD)'
    )
    .option('--comment', "post the verdict as a comment on the current branch's PR via gh")
    .option(
      '--out <path>',
      'write the verdict JSON artifact to a file (use the global --json to stream it to stdout instead)'
    )
    .action(async (opts: Record<string, unknown>, cmd: Command) => {
      const result = await runOutcomeEvalCi({
        specPath: opts.spec as string | undefined,
        diffRange: opts.diff as string | undefined,
        testOutputPath: opts.testOutput as string | undefined,
        blockOn: opts.blockOn as OutcomeBlockOn | undefined,
        model: opts.model as string | undefined,
        commit: opts.commit as string | undefined,
      });
      const streamJson = cmd.optsWithGlobals().json === true;
      emitOutcomeEvalCi(result, {
        jsonPath: typeof opts.out === 'string' ? opts.out : streamJson ? true : undefined,
        comment: opts.comment as boolean | undefined,
      });
      // process.exit is confined to the commander action so the pure functions
      // above remain testable; the exit code reflects the TS-derived authority.
      process.exit(result.exitCode);
    });
}
