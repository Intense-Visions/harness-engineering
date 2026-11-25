import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command, Option } from 'commander';
import {
  Err,
  Ok,
  PHASE_COMPLEXITIES,
  REVIEW_RIGORS,
  collectPackageEntryPoints,
  escapeTerminalText as inert,
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
  resolveCommit,
  resolveFinalReviewBase,
  remoteTrackingRef,
  resolveRepoRoots,
  resolveStandaloneReviewBase,
  runGitIn,
  sessionDirFrom,
  sessionStartingCommit,
  type CwdGit,
  type FinalBaseOutcome,
  type StandaloneBaseOutcome,
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
  /** The branch a final or standalone review merges into (a stacked branch's parent). */
  target?: string;
  /** Config file to read `review.backend` from. Default: the repository top's harness.config.json. */
  configPath?: string;
  cwd?: string;
  git?: CwdGit;
}

export interface ReviewTierBackend extends ResolvedReviewBackend {
  /** `review.backend` as configured, when it is set. */
  configured?: ReviewBackend;
}

interface TierFields {
  tier: ReviewTier;
  /** Why the tier is `full`. Empty for `light`. */
  reasons: string[];
  backend: ReviewTierBackend;
}

/** A phase review: the tier of the resolved range. */
export interface PhaseTierResult extends TierFields {
  moment: 'phase';
  base: string;
  head: string;
  changedFiles: number;
}

/** Why a final review's base is unresolved. */
export type FinalBaseUnresolved =
  | Extract<FinalBaseOutcome, { status: 'unresolved' }>['reason']
  | 'head-unresolved'
  | 'session-invalid';
/** Why a standalone review's base is unresolved. */
export type StandaloneBaseUnresolved =
  | Extract<StandaloneBaseOutcome, { status: 'unresolved' }>['reason']
  | 'head-unresolved';

/**
 * The base a review is measured from, and the head it was resolved for; or why none resolved.
 * `target`: the full name of the remote-tracking branch `--target` named. Only a final receipt
 * records it (as `diff.target`); a standalone receipt carrying `diff.target` is invalid.
 */
type ReviewBaseFields<U, S> =
  | { base: string; baseSource: S; head: string; target?: string }
  | { baseUnresolved: U; head?: string };

/** A final review: always full, with the base the gate will demand. */
export type FinalTierResult = TierFields & { moment: 'final' } & ReviewBaseFields<
    FinalBaseUnresolved,
    ReviewBaseSource
  >;
/** A standalone review: always full, with the advised base (the gate checks only ancestry). */
export type StandaloneTierResult = TierFields & { moment: 'standalone' } & ReviewBaseFields<
    StandaloneBaseUnresolved,
    'merge-base'
  >;

export type ReviewTierResult = PhaseTierResult | FinalTierResult | StandaloneTierResult;

/** The tier, before the backend is resolved for it. */
type Tiered = ReviewTierResult extends infer R
  ? R extends unknown
    ? Omit<R, 'backend'>
    : never
  : never;

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
  // Each issue under its own key: only a bad `backend` is a backend error.
  const issues = parsed.error.issues.map((i) => {
    const key = ['review', ...i.path.map(String)].join('.');
    return key === 'review.backend'
      ? `review.backend must be one of ${REVIEW_BACKENDS.join(', ')}`
      : `${key}: ${i.message}`;
  });
  return fail(`invalid review config in ${file}: ${issues.join('; ')}`);
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

/**
 * Files every package.json of the reviewed head names in `main`, `bin` or `exports`, read from
 * that commit (`git show <head>:<path>`), not from the working tree: the manifest that matters
 * is the one that was reviewed.
 */
function packageEntryPoints(git: CwdGit, head: string, top: string): string[] {
  const manifests = git(['ls-tree', '-r', '-z', '--name-only', head], top)
    .split('\0')
    .filter((f) => f === 'package.json' || f.endsWith('/package.json'));
  const out: string[] = [];
  for (const manifest of manifests) {
    try {
      const pkg: unknown = JSON.parse(git(['show', `${head}:${manifest}`], top));
      out.push(...collectPackageEntryPoints(pkg, path.posix.dirname(manifest)));
    } catch {
      // Not JSON, or not readable at the head: it names no entry point.
    }
  }
  return out;
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

/**
 * Every commit message of the range and, beside each, the trailer lines git identifies in it.
 * `-z` ends each commit with NUL and the format puts NUL between message and trailers: git never
 * stores a NUL in a message, so no message text can move into the trailers slot.
 */
function commitsOf(git: CwdGit, range: string, top: string) {
  const fields = git(['log', '-z', '--format=%B%x00%(trailers:only)', range], top).split('\0');
  const commitMessages = fields.filter((_, i) => i % 2 === 0);
  return {
    commitMessages,
    commitTrailers: commitMessages.map((_, i) =>
      (fields[2 * i + 1] ?? '').split('\n').filter((l) => l !== '')
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
    const selection = selectionOf(opts, git, range, files, top, head);
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
  top: string,
  head: string
): Pick<Tiered, 'tier' | 'reasons'> {
  const diffText = readDiffText(git, range, top);
  // Past the buffer: never "no rule holds" on a diff that was not read.
  if (diffText === undefined) return { tier: 'full', reasons: ['diff-too-large'] };
  return selectReviewTier({
    moment: 'phase',
    changedFiles: files,
    diffText,
    ...commitsOf(git, range, top),
    entryPoints: packageEntryPoints(git, head, top),
    ...(opts.complexity !== undefined && { complexity: opts.complexity }),
    ...(opts.rigor !== undefined && { rigor: opts.rigor }),
  });
}

/**
 * The base the gate will demand of a final review (resolveFinalReviewBase, over the gate's own
 * merge-base lookup), or the base advised for a standalone review (resolveStandaloneReviewBase:
 * the merge base, never a session's starting commit). `--head` defaults to HEAD.
 */
function reviewBaseOf(
  opts: ReviewTierOptions & { moment: 'final' | 'standalone' },
  git: CwdGit,
  cwd: string
): Tiered {
  const tier = { ...selectReviewTier({ moment: opts.moment }) };
  const top = resolveRepoRoots(git, cwd)?.top;
  const head = top === undefined ? undefined : resolveCommit(git, opts.head ?? 'HEAD', top);
  if (top === undefined || head === undefined) {
    return { moment: opts.moment, ...tier, baseUnresolved: 'head-unresolved' };
  }
  const at = { cwd: top, head, git, target: opts.target };
  const ref = opts.target === undefined ? undefined : remoteTrackingRef(git, opts.target, top);
  const target = ref === undefined ? {} : { target: ref };
  if (opts.moment === 'standalone') {
    const r = resolveStandaloneReviewBase(at);
    return r.status === 'resolved'
      ? { moment: 'standalone', ...tier, head, base: r.base, baseSource: r.baseSource, ...target }
      : { moment: 'standalone', ...tier, head, baseUnresolved: r.reason };
  }
  const start = startOf(opts.session, git, cwd);
  if ('invalid' in start)
    return { moment: 'final', ...tier, head, baseUnresolved: 'session-invalid' };
  const r = resolveFinalReviewBase({ ...at, startingCommit: start.startingCommit });
  return r.status === 'resolved'
    ? { moment: 'final', ...tier, head, base: r.base, baseSource: r.baseSource, ...target }
    : { moment: 'final', ...tier, head, baseUnresolved: r.reason };
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

const UNRESOLVED_TEXT: Record<FinalBaseUnresolved | StandaloneBaseUnresolved, string> = {
  'starting-commit-unknown':
    "no default-branch merge base, and the session's starting commit is unknown: pass --session " +
    'with the autopilot session, or --target with the branch this one merges into',
  'no-default-branch':
    'no default-branch merge base: name the range to review explicitly (a commit-range argument; ' +
    'its first commit is the base), or pass --target with the branch this one merges into',
  'target-unresolved':
    'is not a remote-tracking branch (such as origin/parent) that has a merge base with the head',
  'target-own-branch':
    "is the branch under review (a configured remote's branch of the same name), whose merge " +
    'base is its own last pushed commit: name the branch this one merges into',
  'head-unresolved': 'the head could not be resolved to a commit',
  'session-invalid': 'the --session value is not a valid session name',
};

/** What the gate will demand of the review's base. Phase reviews print their range instead. */
function baseLine(r: ReviewTierResult, target: string | undefined): string[] {
  if (r.moment === 'phase') return [];
  if ('baseUnresolved' in r) {
    const why = UNRESOLVED_TEXT[r.baseUnresolved];
    const text =
      r.baseUnresolved === 'target-unresolved' || r.baseUnresolved === 'target-own-branch'
        ? `--target "${inert(target ?? '')}" ${why}`
        : why;
    return [`Review base: unresolved (${text})`];
  }
  const rule =
    r.moment === 'final'
      ? 'the gate requires exactly this base'
      : 'for a standalone review the gate checks only that the base is an ancestor of the head';
  const against = r.target === undefined ? '' : `, against ${inert(r.target)}`;
  return [`Review base: ${r.base} (${r.baseSource}${against}; ${rule})`, `Review head: ${r.head}`];
}

/**
 * A final review over an empty range (its base is its head, or the range changes no files) has
 * nothing to review: the message says so, as a phase with no files does. undefined otherwise,
 * including when git cannot list the range (the gate reports that).
 */
function emptyFinalRange(r: Tiered, git: CwdGit, cwd: string): string | undefined {
  if (r.moment !== 'final' || !('base' in r)) return undefined;
  const top = resolveRepoRoots(git, cwd)?.top ?? cwd;
  const files = r.base === r.head ? [] : listDiffFiles(git, r.base, r.head, top);
  return files?.length === 0
    ? `the final range ${r.base}..${r.head} is empty (it changes no files): there is no final review`
    : undefined;
}

/** A flag the moment does not read: an error, never silently ignored. */
const MOMENT_FLAGS: ReadonlyArray<{
  flag: string;
  set: (o: ReviewTierOptions) => boolean;
  reads: readonly ReviewMoment[];
  why: string;
}> = [
  {
    flag: '--session',
    set: (o) => o.session !== undefined,
    reads: ['final'],
    why: '--session applies to --moment final only: a standalone review takes its base from the range it reviews',
  },
  {
    flag: '--base',
    set: (o) => o.base !== undefined,
    reads: ['phase'],
    why: '--base applies to --moment phase only: a final or standalone base is computed',
  },
  {
    flag: '--target',
    set: (o) => o.target !== undefined,
    reads: ['final', 'standalone'],
    why: '--target applies to --moment final and standalone only',
  },
  {
    flag: '--complexity',
    set: (o) => o.complexity !== undefined,
    reads: ['phase'],
    why: '--complexity applies to --moment phase only: a final or standalone review is always full',
  },
  {
    flag: '--rigor',
    set: (o) => o.rigor !== undefined,
    reads: ['phase'],
    why: '--rigor applies to --moment phase only: a final or standalone review is always full',
  },
];

function flagsTheMomentIgnores(opts: ReviewTierOptions): string | undefined {
  return MOMENT_FLAGS.find((f) => f.set(opts) && !f.reads.includes(opts.moment))?.why;
}

/**
 * The review tier and backend for one review (spec D5, D8). This is `selectReviewTier` and
 * `resolveReviewBackend` with their inputs gathered: the diff, the range's commit messages and
 * the package entry points from git, and `review.backend` from the project's config file. The
 * answer is the same from any directory of the repository. No model, no network.
 */
export function runReviewTier(opts: ReviewTierOptions): Result<ReviewTierResult, Error> {
  const { cwd = process.cwd(), git = runGitIn } = opts;
  const ignored = flagsTheMomentIgnores(opts);
  if (ignored !== undefined) return fail(ignored);
  const configured = readConfiguredBackend(configFileFor(opts, git, cwd));
  if (!configured.ok) return configured;
  let tiered: Result<Tiered, Error>;
  if (opts.moment === 'phase') {
    const roots = resolveRepoRoots(git, cwd);
    if (!roots) return fail('not inside a git repository: a phase tier is computed from a diff');
    tiered = phaseResult(opts, git, roots.top);
  } else {
    tiered = Ok(reviewBaseOf({ ...opts, moment: opts.moment }, git, cwd));
  }
  if (!tiered.ok) return tiered;
  const empty = emptyFinalRange(tiered.value, git, cwd);
  if (empty !== undefined) return fail(empty);
  const backend = resolveReviewBackend({
    configured: configured.value,
    pipelineRunnerAvailable: opts.pipelineRunner === true,
    tier: tiered.value.tier,
  });
  const tag = configured.value === undefined ? {} : { configured: configured.value };
  return Ok({ ...tiered.value, backend: { ...backend, ...tag } });
}

/** The text output. Reasons carry changed paths and the target is the caller's: both print inert. */
export function formatReviewTier(r: ReviewTierResult, target?: string): string[] {
  const reasons = r.reasons.map(inert).join(', ');
  const why = r.reasons.length > 0 ? ` (${reasons})` : ' (no rule for full holds)';
  const b = r.backend;
  const note = b.reason === undefined ? '' : ` (${b.degraded ? 'DEGRADED: ' : ''}${b.reason})`;
  return [
    `Review tier: ${r.tier}${why}`,
    `Review backend: ${b.backend}${note}`,
    ...baseLine(r, target),
  ];
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
  target?: string;
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
    ...(flags.target !== undefined && { target: flags.target }),
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
        'complexity and rigor decide a phase; final and standalone are always full. For a final ' +
        'review it prints the base the receipt gate will demand, and for a standalone review the ' +
        'advised base, the default-branch merge base, which the gate checks only for ancestry ' +
        '(base, baseSource). ' +
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
      "Autopilot session (--moment final only): a final review's base is its starting commit when no default branch resolves"
    )
    .option(
      '--target <ref>',
      'The remote-tracking branch a final or standalone review merges into, such as a stacked PR base (origin/parent): the base is the merge base with it instead of the default branch. A final receipt records the full ref printed as diff.target'
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
        // The message can carry --base/--head and git's or the config's error text: print it inert.
        else logger.error(inert(out.error.message));
        process.exitCode = ExitCode.VALIDATION_FAILED;
        return;
      }
      if (globalOpts.json) {
        console.log(JSON.stringify(out.value, null, 2));
        return;
      }
      for (const line of formatReviewTier(out.value, flags.target)) console.log(line);
    });
}
