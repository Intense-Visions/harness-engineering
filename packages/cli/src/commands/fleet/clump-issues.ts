// packages/cli/src/commands/fleet/clump-issues.ts
//
// `harness fleet clump-issues` — the intake seam's runnable surface
// (docs/changes/clumping/proposal.md, Phase 4).
//
// The sibling of `harness fleet budget-check`: a concrete, enforceable callable
// a `-fleet` SKILL invokes, so the clump axis `issue-fleet` carries is CODE an
// agent runs rather than a paragraph an agent is trusted to apply. Phase 3
// learned that a "seam" described in prose has nothing behind it; this command
// is the answer to that for intake.
//
// It never mutates anything. It enumerates the open-issue backlog, forms the
// clump set, and prints it with EVERY shed count and the conservation check —
// the exact surface `issue-fleet`'s single CONFIRM round presents.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';

import {
  clumpingFromConfig,
  overlayClumpPolicy,
  reportIgnoredClumpingBlock,
  resolveSeamClumpPolicy,
  type ClumpCounts,
  type ClumpPolicy,
} from '@harness-engineering/core';
import chalk from 'chalk';
import { Command } from 'commander';

import { findConfigFile, resolveConfig } from '../../config/loader';
import {
  INTAKE_CLUMP_POLICY,
  UNSCOPED,
  clumpIssues,
  type IntakeClumpReport,
  type IntakeIssue,
} from './clumpable-issues';

/** Exit code for a conservation breach — a bucket lost an item. */
export const CONSERVATION_BREACH_EXIT_CODE = 11;

/** Exit code for an unusable backlog source (no `gh`, no auth, unreadable input). */
export const BACKLOG_UNAVAILABLE_EXIT_CODE = 12;

export interface ClumpIssuesOptions {
  /** Read the backlog from a `gh issue list --json …` dump instead of calling `gh`. `-` = stdin. */
  input?: string;
  /** Issue state to enumerate when calling `gh`. Default `open`. */
  state?: string;
  /** Max issues to enumerate when calling `gh`. Default 1000. */
  limit?: string;
  /** `owner/repo` override passed through to `gh`. */
  repo?: string;
  /** Emit the clump set as JSON. */
  json?: boolean;
  maxClumps?: string;
  maxPerClump?: string;
  minToClump?: string;
  /** The global `-c/--config` path. Absent ⇒ discovered from the cwd upward. */
  config?: string;
}

/**
 * The `gh` argument vector.
 *
 * Exported so the argument shape is pinned by a test rather than asserted by a
 * comment: `body` is the field that makes scope derivation possible at all, and
 * dropping it would leave every issue `unscoped` while the command still
 * printed a clean-looking report.
 */
export function buildGhArgs(options: ClumpIssuesOptions): string[] {
  const args = [
    'issue',
    'list',
    '--state',
    options.state ?? 'open',
    '--limit',
    options.limit ?? '1000',
    '--json',
    'number,title,body,labels,url',
  ];
  if (options.repo) args.push('--repo', options.repo);
  return args;
}

/** A backlog source that failed, with the gap named rather than simulated. */
export interface BacklogGap {
  gap: string;
}

/**
 * Read the backlog.
 *
 * NEVER fabricates a queue. A missing `gh`, a missing auth, or an unreadable
 * dump returns the gap — matching `issue-fleet`'s own rule that a missing `gh`
 * auth "degrades to reporting the gap rather than aborting": with no queue
 * there is nothing to clump, and an empty clump set printed over a failed fetch
 * is indistinguishable from a backlog that genuinely holds no groups.
 */
export function readBacklog(options: ClumpIssuesOptions): IntakeIssue[] | BacklogGap {
  let raw: string;
  if (options.input) {
    try {
      raw =
        options.input === '-'
          ? fs.readFileSync(0, 'utf-8')
          : fs.readFileSync(options.input, 'utf-8');
    } catch (error) {
      return { gap: `cannot read ${options.input}: ${(error as Error).message}` };
    }
  } else {
    try {
      raw = execFileSync('gh', buildGhArgs(options), {
        encoding: 'utf-8',
        // A 347-issue backlog with bodies is already several MB; the 1MB default
        // would truncate mid-JSON and surface as a parse error rather than as the
        // size problem it is.
        maxBuffer: 256 * 1024 * 1024,
      });
    } catch (error) {
      return {
        gap: `\`gh ${buildGhArgs(options).join(' ')}\` failed: ${(error as Error).message}`,
      };
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { gap: `backlog is not JSON: ${(error as Error).message}` };
  }
  if (!Array.isArray(parsed)) return { gap: 'backlog JSON is not an array of issues' };
  return parsed as IntakeIssue[];
}

/** A partial clump policy from the flags. Absent flags ⇒ whatever is under them. */
export function policyFromOptions(options: ClumpIssuesOptions): Partial<ClumpPolicy> {
  const policy: Partial<ClumpPolicy> = {};
  const n = (raw: string | undefined): number | undefined => {
    if (raw === undefined) return undefined;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : undefined;
  };
  const maxClumps = n(options.maxClumps);
  const maxPerClump = n(options.maxPerClump);
  const minToClump = n(options.minToClump);
  if (maxClumps !== undefined) policy.maxClumps = maxClumps;
  if (maxPerClump !== undefined) policy.maxPerClump = maxPerClump;
  if (minToClump !== undefined) policy.minToClump = minToClump;
  return policy;
}

/** Is there a config file to fail at, or genuinely none? Structural, not a message match. */
function configExists(configPath: string | undefined): boolean {
  return configPath === undefined ? findConfigFile().ok : fs.existsSync(configPath);
}

/**
 * The `clumping` block, or `undefined` when there is no config to read.
 *
 * A MISSING config is not an error here, and that is success criterion 13 at
 * this seam: `harness fleet clump-issues` is a read-only reporting command an
 * agent runs from wherever it happens to be standing, and refusing to run
 * because no `harness.config.json` was found above the cwd would be a new
 * failure mode in exchange for a tuning field nobody set.
 *
 * A config that EXISTS and does not load is a different thing, and it is
 * REPORTED. This comment used to claim such a config "has already been reported
 * on stderr by the loader's own validation"; `resolveConfig` returns
 * `Err(CLIError)` and prints nothing, so a project whose `clumping` block was
 * written correctly but whose config failed validation elsewhere ran on the
 * defaults with no way to tell. Absent is distinguished STRUCTURALLY, not by
 * matching the error message, which would go quiet on a reword.
 */
function clumpingBlockFor(options: ClumpIssuesOptions): ReturnType<typeof clumpingFromConfig> {
  const loaded = resolveConfig(options.config);
  if (loaded.ok) return clumpingFromConfig(loaded.value);
  if (configExists(options.config)) reportIgnoredClumpingBlock([loaded.error.message]);
  return undefined;
}

/**
 * The policy this run uses: the intake baseline, then the config, then flags.
 *
 * Flags win over config for the reason flags always win over config — they are
 * the narrower, more deliberate statement — and the intake baseline sits at the
 * bottom because it is a built-in default, which is precisely what config is
 * for overriding.
 */
function resolveIntakePolicy(options: ClumpIssuesOptions): Partial<ClumpPolicy> {
  // Per-field, like the two seams below it. `policyFromOptions` only ever
  // ASSIGNS defined values, so a spread here happens to be safe today — but
  // that is a precondition held in another function's body and enforced by
  // nothing, which is the same shape as the two spreads this change had to fix.
  return overlayClumpPolicy(
    resolveSeamClumpPolicy(clumpingBlockFor(options), 'intake', INTAKE_CLUMP_POLICY),
    policyFromOptions(options)
  );
}

/**
 * The conservation check (success criterion 6), as a value rather than a claim.
 *
 * Returned with both sides of the equation so the printed line carries the
 * arithmetic, not a bare `OK`. A conservation breach means a bucket lost an
 * item — the silent delete this whole control exists to prevent — so the
 * command exits non-zero on it.
 */
export function checkConservation(counts: ClumpCounts): {
  holds: boolean;
  input: number;
  sum: number;
} {
  const sum = counts.clumped + counts.floored + counts.overCap + counts.ungraded + counts.solo;
  return { holds: counts.input === sum, input: counts.input, sum };
}

function renderShedCounts(report: IntakeClumpReport): string[] {
  const pad = (label: string, value: number): string =>
    `  ${label.padEnd(28)}${String(value).padStart(5)}`;
  return [
    pad('individual queue entries', report.individual),
    pad('unscoped', report.unscoped),
    pad('untyped (no type label)', report.untyped),
    pad('multi-typed (routing fork)', report.multiTyped),
    `${pad('floored', report.floored)}   ${chalk.dim('(0 by construction at intake — the item is already filed)')}`,
    pad('over cap', report.overCap),
    pad('conflict splits', report.conflictSplits),
  ];
}

/** Render the clump set exactly as `issue-fleet`'s CONFIRM round presents it. */
export function renderHuman(outcome: ReturnType<typeof clumpIssues>): string {
  const { result, report } = outcome;
  const lines: string[] = [
    chalk.bold(
      `Clump axis — ${report.issues} issues, ${report.clumps} clumps, ${report.clumped} clumped`
    ),
    '',
  ];
  if (result.clumps.length === 0) {
    lines.push(chalk.dim('  no clumps — every issue stays its own queue entry'));
  }
  for (const clump of result.clumps) {
    const scope = clump.scope === UNSCOPED ? chalk.yellow(UNSCOPED) : clump.scope;
    lines.push(
      `  ${chalk.cyan(String(clump.members.length).padStart(2))} × ${chalk.bold(clump.kind.padEnd(14))} ${scope}`
    );
    lines.push(`     ${clump.members.map((m) => `#${(m.ref as IntakeIssue).number}`).join(' ')}`);
  }
  lines.push(
    '',
    chalk.bold('Shed counts (every one reported, none hidden):'),
    ...renderShedCounts(report)
  );

  const conservation = checkConservation(result.counts);
  const c = result.counts;
  const arithmetic =
    `${c.input} = ${c.clumped} clumped + ${c.floored} floored + ${c.overCap} over-cap + ` +
    `${c.ungraded} ungraded + ${c.solo} solo`;
  lines.push(
    '',
    conservation.holds
      ? chalk.green(`Conservation holds: ${arithmetic}`)
      : chalk.red(`CONSERVATION BREACH: ${arithmetic} (sum ${conservation.sum} ≠ input ${c.input})`)
  );
  return lines.join('\n');
}

/** Injectable seams, mirroring `runRoadmapReconcile`'s `store`/`adapter`. */
export interface ClumpIssuesDeps {
  /**
   * The clump former. Injectable for ONE reason: the conservation breach is
   * unreachable through the real primitive, and an exit path whose failure
   * branch nothing can reach is a label rather than a gate.
   */
  clump?: typeof clumpIssues;
}

/**
 * Enumerate the backlog, form the clump set, print it. Returns the exit code.
 *
 * Read-only: it calls `gh issue list` and nothing else. The clump set it prints
 * is an input to `issue-fleet`'s single CONFIRM round, never a mutation.
 */
export function runClumpIssues(options: ClumpIssuesOptions, deps: ClumpIssuesDeps = {}): number {
  const backlog = readBacklog(options);
  if ('gap' in backlog) {
    console.error(
      chalk.yellow(`clump-issues: backlog unavailable — ${backlog.gap}`) +
        chalk.dim(
          '\n  Nothing was simulated. Authenticate `gh` (gh auth login) or pass --input <dump.json>.'
        )
    );
    return BACKLOG_UNAVAILABLE_EXIT_CODE;
  }

  const outcome = (deps.clump ?? clumpIssues)(backlog, resolveIntakePolicy(options));
  const conservation = checkConservation(outcome.result.counts);

  if (options.json) {
    console.log(
      JSON.stringify({
        report: outcome.report,
        conservation,
        clumps: outcome.result.clumps.map((clump) => ({
          id: clump.id,
          scope: clump.scope,
          kind: clump.kind,
          weight: clump.weight,
          members: clump.members.map((m) => (m.ref as IntakeIssue).number),
        })),
        individual: outcome.individual.map((item) => (item.ref as IntakeIssue).number),
        ungraded: outcome.result.ungraded.map((item) => (item.ref as IntakeIssue).number),
      })
    );
  } else {
    console.log(renderHuman(outcome));
  }

  return conservation.holds ? 0 : CONSERVATION_BREACH_EXIT_CODE;
}

export function createClumpIssuesCommand(): Command {
  return new Command('clump-issues')
    .description(
      "Form the intake clump set over the open-issue backlog (issue-fleet's fifth triage " +
        'axis): group DISTINCT issues of the same type over the same scope into one work ' +
        'unit, and report every shed count plus the conservation check. Read-only.'
    )
    .option(
      '--input <file>',
      'read a `gh issue list --json` dump instead of calling gh (`-` = stdin)'
    )
    .option('--state <state>', 'issue state to enumerate (open | closed | all)', 'open')
    .option('--limit <n>', 'max issues to enumerate', '1000')
    .option('--repo <owner/repo>', 'repository override passed through to gh')
    .option('--max-clumps <n>', 'cap on emitted work units (default: uncapped at intake)')
    .option('--max-per-clump <n>', 'max members in one clump (default 12)')
    .option('--min-to-clump <n>', 'a group below this many members stays solo (default 2)')
    .option('--json', 'emit the clump set as JSON')
    .action((opts: ClumpIssuesOptions, cmd: Command) => {
      // `--json` is also a GLOBAL option on the root program, so merge globals in
      // (a bare `harness --json fleet clump-issues` sets it on the parent).
      const globals = cmd.optsWithGlobals() as ClumpIssuesOptions;
      const configPath = opts.config ?? globals.config;
      process.exitCode = runClumpIssues({
        ...opts,
        json: Boolean(opts.json ?? globals.json),
        // `-c/--config` is a ROOT option, so it only ever arrives through the
        // globals — reading `opts.config` alone would silently ignore it.
        // Spread rather than assigned: under `exactOptionalPropertyTypes` an
        // explicit `config: undefined` is NOT the same as an absent key.
        ...(configPath === undefined ? {} : { config: configPath }),
      });
    });
}
