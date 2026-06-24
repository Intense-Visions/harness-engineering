import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { Command } from 'commander';
import { parseDiff, runCiReview } from '@harness-engineering/core';
import type {
  DiffInfo,
  RunCiReviewOptions,
  CiReviewResult,
  CiBlockOn,
} from '@harness-engineering/core';
import { createLocalInvoke } from './review-ci-local-adapter';
import { logger } from '../output/logger';

/**
 * Injectable git seam. Returns trimmed stdout of `git <args>`.
 * Real implementation uses `execFileSync` (no shell) so callers cannot inject
 * shell metacharacters and tests can stub it without spawning a process.
 */
export type RunGit = (args: string[]) => string;

const defaultRunGit: RunGit = (args) =>
  execFileSync('git', args, { encoding: 'utf-8' }).toString().trim();

/**
 * Resolve the git range to diff for the review.
 *
 * - If an explicit `range` is provided, it is used verbatim.
 * - Otherwise the base branch is resolved from `origin/HEAD`
 *   (`git symbolic-ref refs/remotes/origin/HEAD`), defaulting to `main`
 *   when the symbolic ref is absent (e.g. some CI checkouts) — in which
 *   case the caller can pass `--diff` explicitly.
 */
export function resolveDiffRange(opts: { range?: string; cwd?: string; runGit?: RunGit }): string {
  if (opts.range) return opts.range;
  const runGit = opts.runGit ?? defaultRunGit;
  let base = 'main';
  try {
    const ref = runGit(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const m = ref.match(/origin\/(.+)$/);
    if (m?.[1]) base = m[1];
  } catch {
    // No origin/HEAD symbolic ref — fall back to main.
  }
  return `origin/${base}...HEAD`;
}

/**
 * Split a raw unified diff into per-file sections keyed by the (new) path.
 *
 * `parseDiff` returns `ChangedFile` metadata (path/status/counts) but NOT the
 * per-file diff text, while core's CI orchestrator reconstructs the STDIN diff
 * via `Array.from(diff.fileDiffs.values()).join('\n')`. So we must populate
 * `fileDiffs` with real per-file content (not empty strings) or the LLM tier
 * would receive an empty diff. Sections are delimited by `diff --git` headers.
 */
function splitDiffByFile(rawDiff: string): Map<string, string> {
  const sections = new Map<string, string>();
  const headerRe = /^diff --git a\/.+ b\/(.+)$/;
  let currentPath: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (currentPath !== null) sections.set(currentPath, buffer.join('\n'));
  };
  for (const line of rawDiff.split('\n')) {
    const m = line.match(headerRe);
    if (m?.[1]) {
      flush();
      currentPath = m[1];
      buffer = [line];
    } else if (currentPath !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/**
 * Build a core {@link DiffInfo} from a raw unified-diff string by reusing core's
 * `parseDiff` for file metadata and splitting the raw diff for per-file content.
 */
export function buildDiffInfo(rawDiff: string): DiffInfo {
  const parsed = parseDiff(rawDiff);
  if (!parsed.ok) throw new Error(`Failed to parse diff: ${parsed.error.message}`);
  const files = parsed.value.files;
  const perFile = splitDiffByFile(rawDiff);
  return {
    changedFiles: files.map((f) => f.path),
    newFiles: files.filter((f) => f.status === 'added').map((f) => f.path),
    deletedFiles: files.filter((f) => f.status === 'deleted').map((f) => f.path),
    totalDiffLines: rawDiff.split('\n').length,
    fileDiffs: new Map(files.map((f) => [f.path, perFile.get(f.path) ?? rawDiff])),
  };
}

/** Resolve the raw unified-diff string for a range via the injectable git seam. */
function defaultResolveRaw(range: string, _cwd: string, runGit: RunGit): string {
  return runGit(['diff', range]);
}

export interface ReviewCiOptions {
  cwd?: string | undefined;
  runner?: string | undefined;
  blockOn?: CiBlockOn | undefined;
  diffRange?: string | undefined;
  // Injected seams for tests (default to the real implementations):
  runCiReviewImpl?: (o: RunCiReviewOptions) => Promise<CiReviewResult>;
  localInvoke?: RunCiReviewOptions['localInvoke'];
  runGit?: RunGit;
  resolveRaw?: (range: string, cwd: string, runGit: RunGit) => string;
}

/**
 * Pure orchestration for `review-ci`: resolve the diff range, build the
 * {@link DiffInfo}, select the runner, and delegate to core's `runCiReview`.
 *
 * - No runner => floor-only (runner undefined, no localInvoke).
 * - `local` => inject the openai-compatible {@link createLocalInvoke} adapter.
 * - agent-cli runners (claude/gemini/codex/...) => core uses its default
 *   `execFile` seam; no localInvoke is injected.
 *
 * Returns the orchestrator's {@link CiReviewResult} unchanged (incl. exitCode).
 * Contains NO `process.exit` so it stays unit-testable.
 */
/** Assemble the core `runCiReview` options, selecting the runner-specific seams. */
function buildCallOpts(opts: ReviewCiOptions, cwd: string, diff: DiffInfo): RunCiReviewOptions {
  const runner = opts.runner as RunCiReviewOptions['runner'] | undefined;
  return {
    projectRoot: cwd,
    diff,
    ...(runner ? { runner } : {}),
    ...(opts.blockOn ? { blockOn: opts.blockOn } : {}),
    ...(runner === 'local' ? { localInvoke: opts.localInvoke ?? createLocalInvoke() } : {}),
  };
}

export async function runReviewCi(opts: ReviewCiOptions): Promise<CiReviewResult> {
  const cwd = opts.cwd ?? process.cwd();
  const runGit = opts.runGit ?? defaultRunGit;
  const range = resolveDiffRange({
    ...(opts.diffRange ? { range: opts.diffRange } : {}),
    cwd,
    runGit,
  });
  const rawDiff = (opts.resolveRaw ?? defaultResolveRaw)(range, cwd, runGit);
  const diff = buildDiffInfo(rawDiff);
  const callOpts = buildCallOpts(opts, cwd, diff);
  return (opts.runCiReviewImpl ?? runCiReview)(callOpts);
}

/**
 * Emit the review result: print the terminal summary, optionally write the
 * verdict artifact, and (in this phase) warn that `--comment` is stubbed.
 *
 * Pure aside from the injected `writeFile`/`log` seams — contains NO
 * `process.exit`, so it stays unit-testable.
 */
export function emitReviewCi(
  result: CiReviewResult,
  opts: { jsonPath?: string | undefined; comment?: boolean | undefined },
  writeFile: (p: string, d: string) => void = (p, d) => writeFileSync(p, d),
  log: (m: string) => void = (m) => process.stdout.write(m + '\n')
): void {
  log(result.terminalOutput);
  if (opts.jsonPath) writeFile(opts.jsonPath, JSON.stringify(result.verdict, null, 2));
  if (opts.comment) {
    logger.warn(
      'review-ci: --comment posting is not yet wired (no gh PR poster; Phase 3 stub). ' +
        'The verdict above is authoritative; use --json to capture the artifact. ' +
        'PR-review posting lands in a later phase.'
    );
  }
}

/** Build the top-level `harness review-ci` command. */
export function createReviewCiCommand(): Command {
  return new Command('review-ci')
    .description('Run the tiered code-review gate (floor + optional LLM runner) for CI')
    .option(
      '--runner <runner>',
      'claude | gemini | codex | cursor | antigravity | local (omit = floor-only)'
    )
    .option('--block-on <level>', 'critical | request-changes | none', 'request-changes')
    .option('--diff <range>', 'git range (default: origin/<base>...HEAD)')
    .option('--comment', 'post verdict as a PR review (stubbed in this phase)')
    .option('--json <path>', 'write the verdict artifact to this path')
    .action(async (opts: Record<string, unknown>) => {
      const result = await runReviewCi({
        runner: opts.runner as string | undefined,
        blockOn: opts.blockOn as CiBlockOn | undefined,
        diffRange: opts.diff as string | undefined,
      });
      emitReviewCi(result, {
        jsonPath: opts.json as string | undefined,
        comment: opts.comment as boolean | undefined,
      });
      // process.exit is confined to the commander action so the pure functions
      // above remain testable; propagate the orchestrator's exit code verbatim.
      process.exit(result.exitCode);
    });
}
