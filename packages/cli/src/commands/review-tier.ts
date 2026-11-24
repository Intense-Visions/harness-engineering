import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Option } from 'commander';
import {
  Err,
  Ok,
  PHASE_COMPLEXITIES,
  REVIEW_RIGORS,
  collectPackageEntryPoints,
  resolveReviewBackend,
  selectReviewTier,
  type PhaseComplexity,
  type ResolvedReviewBackend,
  type Result,
  type ReviewRigor,
} from '@harness-engineering/core';
import {
  REVIEW_BACKENDS,
  REVIEW_MOMENTS,
  type ReviewBackend,
  type ReviewBaseSource,
  type ReviewMoment,
  type ReviewTier,
} from '@harness-engineering/types';
import { findConfigFile, resolveProject } from '../config/loader';
import { ReviewConfigSchema } from '../config/schema';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import {
  listDiffFiles,
  resolveFinalReviewBase,
  resolveRepoRoots,
  runGitIn,
  sessionDirFrom,
  sessionStartingCommit,
  tryGit,
  type CwdGit,
} from '../review-receipts/io';

export interface ReviewTierOptions {
  moment: ReviewMoment;
  /** The reviewed range. Required for a phase review; unused for final and standalone. */
  base?: string;
  head?: string;
  complexity?: PhaseComplexity;
  rigor?: ReviewRigor;
  /** Whether the calling session can run the coded pipeline (the `run_code_review` tool). */
  pipelineRunner?: boolean;
  /** The autopilot session, whose starting commit is a final review's base when no default branch resolves. */
  session?: string;
  /** Config file to read `review.backend` from. Default: the repository top's harness.config.json. */
  configPath?: string;
  cwd?: string;
  git?: CwdGit;
}

export interface ReviewTierBackend extends ResolvedReviewBackend {
  /** `review.backend` as configured, when it is set. */
  configured?: ReviewBackend;
}

export interface ReviewTierResult {
  moment: ReviewMoment;
  tier: ReviewTier;
  /** Why the tier is `full`. Empty for `light`. */
  reasons: string[];
  backend: ReviewTierBackend;
  /**
   * A phase review: the resolved range. A final or standalone review: the base the gate will
   * demand (`baseSource` says how it was resolved) and the head it was resolved for.
   */
  base?: string;
  head?: string;
  changedFiles?: number;
  baseSource?: ReviewBaseSource;
  /** A final or standalone review whose base cannot be resolved: why. */
  baseUnresolved?: 'starting-commit-unknown' | 'head-unresolved' | 'session-invalid';
}

/** The tier, before the backend is resolved for it. */
type Tiered = Omit<ReviewTierResult, 'backend'>;

const fail = (message: string) => Err(new Error(message));

/**
 * `review.backend` from the config file, parsed with the config schema's ReviewConfigSchema (only
 * the `review` key: the rest of the config is not this command's to validate). An absent file
 * or key is the default, not an error.
 */
function readConfiguredBackend(file: string | undefined): Result<ReviewBackend | undefined, Error> {
  if (file === undefined || !fs.existsSync(file)) return Ok(undefined);
  let review: unknown;
  try {
    review = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { review?: unknown } | null)?.review;
  } catch (err) {
    return fail(`cannot read ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (review === undefined) return Ok(undefined);
  const parsed = ReviewConfigSchema.safeParse(review);
  if (parsed.success) return Ok(parsed.data.backend);
  return fail(`review.backend must be one of ${REVIEW_BACKENDS.join(', ')} in ${file}`);
}

/**
 * The config file `review.backend` is read from: `-c` when given, else the repository top's
 * harness.config.json (so a subdirectory holding its own config, such as an example project, does
 * not change the answer), else, outside a repository, the nearest one at or above `cwd`.
 */
function configFileFor(opts: ReviewTierOptions, git: CwdGit, cwd: string): string | undefined {
  if (opts.configPath !== undefined) return opts.configPath;
  const top = resolveRepoRoots(git, cwd)?.top;
  if (top !== undefined) return path.join(top, 'harness.config.json');
  const found = findConfigFile(cwd);
  return found.ok ? found.value : undefined;
}

/** Files every tracked package.json names in `main`, `bin` or `exports`, from the top level. */
function packageEntryPoints(git: CwdGit, top: string): string[] {
  const manifests = git(['ls-files', '-z', '--', ':(glob)**/package.json'], top)
    .split('\0')
    .filter((f) => f !== '');
  const out: string[] = [];
  for (const manifest of manifests) {
    try {
      const pkg: unknown = JSON.parse(fs.readFileSync(path.join(top, manifest), 'utf-8'));
      out.push(...collectPackageEntryPoints(pkg, path.posix.dirname(manifest)));
    } catch {
      // Deleted in the working tree, or not JSON: it names no entry point.
    }
  }
  return out;
}

/** A user-supplied ref as a commit sha. The ref can never be read as an option. */
function resolveCommit(git: CwdGit, ref: string | undefined, top: string): string | undefined {
  if (ref === undefined) return undefined;
  const args = ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`];
  return tryGit(git, args, top) || undefined;
}

const unresolvedEnd = (given: string | undefined): string =>
  given === undefined
    ? 'a phase review needs --base and --head: the tier is computed from that diff'
    : `cannot resolve "${given}" to a commit`;

/**
 * The diff as text, whatever the attributes say: `--text` reads a file marked `-diff` or
 * `binary` (in a .gitattributes or in .git/info/attributes, neither of which need be in the
 * reviewed range) as text, and no external driver or textconv filter runs.
 */
const DIFF_TEXT = ['diff', '--text', '--no-ext-diff', '--no-textconv', '--no-renames'];

/**
 * The diff's text, or undefined when it is larger than git's output buffer (ENOBUFS): the tier
 * of such a diff is `full`. Any other failure throws, and the caller reports it.
 */
function readDiffText(git: CwdGit, range: string, top: string): string | undefined {
  try {
    return git([...DIFF_TEXT, range], top);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOBUFS') return undefined;
    throw err;
  }
}

/** Every commit message of the range and, beside each, the trailer lines git identifies in it. */
function commitsOf(git: CwdGit, range: string, top: string) {
  const commits = git(['log', '--format=%B%x1f%(trailers:only)%x00', range], top)
    .split('\0')
    .map((entry) => entry.split('\x1f'));
  return {
    commitMessages: commits.map(([message = '']) => message),
    commitTrailers: commits.map(([, trailers = '']) =>
      trailers.split('\n').filter((l) => l !== '')
    ),
  };
}

/**
 * The tier of a phase, from its diff read with git at the repository top level, so diff paths and
 * entry points share one frame. Any step git cannot answer is a failure, never an empty diff.
 */
function phaseResult(opts: ReviewTierOptions, git: CwdGit, top: string): Result<Tiered, Error> {
  const base = resolveCommit(git, opts.base, top);
  const head = resolveCommit(git, opts.head, top);
  if (base === undefined || head === undefined) {
    return fail(unresolvedEnd(base === undefined ? opts.base : opts.head));
  }
  const range = `${base}..${head}`;
  const files = listDiffFiles(git, base, head, top);
  if (files === undefined) return fail(`cannot compute the diff ${range}`);
  if (files.length === 0) return fail(`${range} changes no files; there is no tier`);
  try {
    const selection = selectionOf(opts, git, range, files, top);
    return Ok({ moment: 'phase', ...selection, base, head, changedFiles: files.length });
  } catch (err) {
    return fail(`cannot read the diff: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The phase tier from the diff; `full` (diff-too-large) when the diff is past git's buffer. */
function selectionOf(
  opts: ReviewTierOptions,
  git: CwdGit,
  range: string,
  files: string[],
  top: string
): Pick<Tiered, 'tier' | 'reasons'> {
  const diffText = readDiffText(git, range, top);
  // Past the buffer: never "no rule holds" on a diff that was not read.
  if (diffText === undefined) return { tier: 'full', reasons: ['diff-too-large'] };
  return selectReviewTier({
    moment: 'phase',
    changedFiles: files,
    diffText,
    ...commitsOf(git, range, top),
    entryPoints: packageEntryPoints(git, top),
    ...(opts.complexity !== undefined && { complexity: opts.complexity }),
    ...(opts.rigor !== undefined && { rigor: opts.rigor }),
  });
}

type ReviewBaseFields = Pick<ReviewTierResult, 'base' | 'head' | 'baseSource' | 'baseUnresolved'>;

/**
 * The base the gate will demand of a final review (resolveFinalReviewBase, the gate's own
 * resolver), or the merge base for a standalone review. `--head` defaults to HEAD.
 */
function reviewBaseOf(opts: ReviewTierOptions, git: CwdGit, cwd: string): ReviewBaseFields {
  const top = resolveRepoRoots(git, cwd)?.top;
  const head = top === undefined ? undefined : resolveCommit(git, opts.head ?? 'HEAD', top);
  if (top === undefined || head === undefined) return { baseUnresolved: 'head-unresolved' };
  const start =
    opts.moment === 'final' ? startOf(opts.session, git, cwd) : { startingCommit: undefined };
  if ('invalid' in start) return { head, baseUnresolved: 'session-invalid' };
  const resolved = resolveFinalReviewBase({
    cwd: top,
    head,
    startingCommit: start.startingCommit,
    git,
  });
  if (resolved.status === 'unresolved') return { head, baseUnresolved: resolved.reason };
  return { head, base: resolved.base, baseSource: resolved.baseSource };
}

/** The session's starting commit, when `--session` names one; invalid when it is not a session name. */
function startOf(
  session: string | undefined,
  git: CwdGit,
  cwd: string
): { startingCommit: string | undefined } | { invalid: true } {
  if (session === undefined) return { startingCommit: undefined };
  const dir = sessionDirFrom(git, cwd, session);
  return dir.ok ? { startingCommit: sessionStartingCommit(dir.value) } : { invalid: true };
}

const UNRESOLVED_TEXT: Record<NonNullable<ReviewTierResult['baseUnresolved']>, string> = {
  'starting-commit-unknown':
    "no default-branch merge base, and the session's starting commit is unknown: pass --session",
  'head-unresolved': 'the head could not be resolved to a commit',
  'session-invalid': 'the --session value is not a valid session name',
};

/** What the gate will demand of the review's base. Phase reviews print their range instead. */
function baseLine(r: ReviewTierResult): string[] {
  if (r.moment === 'phase') return [];
  if (r.baseUnresolved !== undefined) {
    return [`Review base: unresolved (${UNRESOLVED_TEXT[r.baseUnresolved]})`];
  }
  const rule =
    r.moment === 'final'
      ? 'the gate requires exactly this base'
      : 'for a standalone review the gate checks only that the base is an ancestor of the head';
  return [`Review base: ${r.base} (${r.baseSource}; ${rule})`];
}

/**
 * The review tier and backend for one review (spec D5, D8). This is `selectReviewTier` and
 * `resolveReviewBackend` with their inputs gathered: the diff, the range's commit messages and
 * the package entry points from git, and `review.backend` from the project's config file. The
 * answer is the same from any directory of the repository. No model, no network.
 */
export function runReviewTier(opts: ReviewTierOptions): Result<ReviewTierResult, Error> {
  const { cwd = process.cwd(), git = runGitIn } = opts;
  const configured = readConfiguredBackend(configFileFor(opts, git, cwd));
  if (!configured.ok) return configured;
  let tiered: Result<Tiered, Error>;
  if (opts.moment === 'phase') {
    const roots = resolveRepoRoots(git, cwd);
    if (!roots) return fail('not inside a git repository: a phase tier is computed from a diff');
    tiered = phaseResult(opts, git, roots.top);
  } else {
    const moment = opts.moment;
    tiered = Ok({ moment, ...selectReviewTier({ moment }), ...reviewBaseOf(opts, git, cwd) });
  }
  if (!tiered.ok) return tiered;
  const backend = resolveReviewBackend({
    configured: configured.value,
    pipelineRunnerAvailable: opts.pipelineRunner === true,
    tier: tiered.value.tier,
  });
  const tag = configured.value === undefined ? {} : { configured: configured.value };
  return Ok({ ...tiered.value, backend: { ...backend, ...tag } });
}

export function formatReviewTier(r: ReviewTierResult): string[] {
  const why = r.reasons.length > 0 ? ` (${r.reasons.join(', ')})` : ' (no rule for full holds)';
  const b = r.backend;
  const note = b.reason === undefined ? '' : ` (${b.degraded ? 'DEGRADED: ' : ''}${b.reason})`;
  return [`Review tier: ${r.tier}${why}`, `Review backend: ${b.backend}${note}`, ...baseLine(r)];
}

/** Injected inputs for tests. */
export interface ReviewTierDeps {
  cwd?: () => string;
  git?: CwdGit;
}

interface ReviewTierFlags {
  moment: ReviewMoment;
  base?: string;
  head?: string;
  complexity?: PhaseComplexity;
  rigor?: ReviewRigor;
  pipelineRunner?: boolean;
  session?: string;
}

/**
 * The run's options. With the global `-c`, the config file names the project: git runs in its
 * directory and `review.backend` is read from it, so the tier is never computed for one project
 * with another project's config.
 */
function optionsFrom(
  flags: ReviewTierFlags,
  globalOpts: { config?: string },
  deps: ReviewTierDeps
): Result<ReviewTierOptions, Error> {
  const base: ReviewTierOptions = {
    moment: flags.moment,
    pipelineRunner: flags.pipelineRunner === true,
    ...(flags.base !== undefined && { base: flags.base }),
    ...(flags.head !== undefined && { head: flags.head }),
    ...(flags.complexity !== undefined && { complexity: flags.complexity }),
    ...(flags.rigor !== undefined && { rigor: flags.rigor }),
    ...(flags.session !== undefined && { session: flags.session }),
    ...(deps.cwd !== undefined && { cwd: deps.cwd() }),
    ...(deps.git !== undefined && { git: deps.git }),
  };
  if (globalOpts.config === undefined) return Ok(base);
  const project = resolveProject(globalOpts.config);
  if (!project.ok) return project;
  return Ok({ ...base, cwd: project.value.root, configPath: project.value.configPath });
}

export function createReviewTierCommand(deps: ReviewTierDeps = {}): Command {
  return new Command('review-tier')
    .description(
      'Compute the review tier (light or full) and backend for one review: risk keywords in the ' +
        "diff and the range's commit messages (identity trailers such as Signed-off-by excluded), " +
        'package entry points, ' +
        'complexity and rigor decide a phase; final and standalone are always full, and for them ' +
        'it prints the base the receipt gate will demand (base, baseSource). ' +
        'Exits 1 when the tier cannot be computed (with --json, prints {"error": ...})'
    )
    .addOption(
      new Option('--moment <moment>', 'Which review this is')
        .choices([...REVIEW_MOMENTS])
        .default('phase')
    )
    .option('--base <sha>', 'Base of the reviewed range (required for a phase review)')
    .option(
      '--head <sha>',
      'Head of the reviewed range (required for a phase review; final and standalone default to HEAD)'
    )
    .option(
      '--session <slug>',
      "Autopilot session: a final review's base is its starting commit when no default branch resolves"
    )
    .addOption(
      new Option('--complexity <level>', "The phase's assessed complexity").choices([
        ...PHASE_COMPLEXITIES,
      ])
    )
    .addOption(new Option('--rigor <level>', 'Rigor level of the run').choices([...REVIEW_RIGORS]))
    .option(
      '--pipeline-runner',
      'This session can run the coded review pipeline (the run_code_review tool is callable)'
    )
    .action((flags: ReviewTierFlags, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as { config?: string; json?: boolean };
      const options = optionsFrom(flags, globalOpts, deps);
      const out = options.ok ? runReviewTier(options.value) : options;
      if (!out.ok) {
        // A JSON consumer gets an object on stdout on failure too, never an empty stream.
        if (globalOpts.json) console.log(JSON.stringify({ error: out.error.message }, null, 2));
        else logger.error(out.error.message);
        process.exitCode = ExitCode.VALIDATION_FAILED;
        return;
      }
      if (globalOpts.json) {
        console.log(JSON.stringify(out.value, null, 2));
        return;
      }
      for (const line of formatReviewTier(out.value)) console.log(line);
    });
}
