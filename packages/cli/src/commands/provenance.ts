import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import type { Command as CommanderCommand } from 'commander';
import {
  PROVENANCE_TRAILER_KEYS,
  validateProvenanceTrailer,
  type ProvenanceShapeResult,
} from '@harness-engineering/core';
import { CLIError, ExitCode } from '../utils/errors';

/**
 * `harness provenance` — read and shape-check the machine-readable `Harness-*`
 * commit trailer (#1531 / #1777).
 *
 * TWO MODES, ONE COMMAND. Reader mode answers "who authored this commit, under
 * which run"; `--check` mode is the CI-callable shape gate. They share a command
 * rather than splitting into subcommands because the issue's requested surface
 * is literally `harness provenance <sha>`, and a Commander command cannot take
 * both a positional argument and subcommands.
 *
 * WHAT THIS DOES NOT DO. It never fails a commit for *lacking* a trailer.
 * `parseProvenanceTrailer` deliberately leaves non-fleet commits unclaimed, and
 * there is no mechanical definition of "agent-authored" in this repo — so
 * `--check` skips unclaimed commits and says how many it skipped. Enforcing
 * presence is a policy decision that is parked on #1777, not implemented here.
 *
 * Distinct from `harness rules provenance`, which is the unrelated ADR-0100
 * rule-to-failure reporter.
 */

/** Injected git seam so the command is testable without a repository. */
export type RunGit = (args: string[]) => string;

export interface ProvenanceCommandOptions {
  /** Commit-ish to read. Defaults to `HEAD`. Ignored when `range` is set. */
  commitish?: string;
  /** Commit range (e.g. `origin/main...HEAD`) to shape-check. Implies `check`. */
  range?: string;
  /** Shape-gate mode instead of reader mode. */
  check?: boolean;
  /** Emit the machine-readable report instead of human lines. */
  json?: boolean;
  /** Repository root (defaults to `process.cwd()`). */
  cwd?: string;
  /** Overrides the real git invocation. */
  runGit?: RunGit;
}

/** One commit's shape-check outcome, as reported. */
export interface ProvenanceCommitReport extends ProvenanceShapeResult {
  commit: string;
}

/** The `--check` report over a scope of commits. */
export interface ProvenanceCheckReport {
  mode: 'check';
  scope: string;
  /** Commits the gate looked at. */
  examined: number;
  /** Commits carrying a `Harness-Run` trailer. */
  carried: number;
  /** Commits with no trailer — unclaimed by design, never a failure. */
  unclaimed: number;
  /** Commits whose trailer is present but malformed. */
  malformed: number;
  commits: ProvenanceCommitReport[];
}

/** The reader-mode report for a single commit. */
export interface ProvenanceReadReport extends ProvenanceCommitReport {
  mode: 'read';
}

export type ProvenanceReport = ProvenanceReadReport | ProvenanceCheckReport;

/** Record separator between commits, and field separator within one. */
const RS = '\x1e';
const FS = '\x1f';

/** Real git invocation; throws on a non-zero exit, which callers translate. */
function defaultRunGit(cwd: string): RunGit {
  return (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** Fail early and legibly when we are not inside a repository at all. */
function assertGitRepository(runGit: RunGit, cwd: string): void {
  try {
    runGit(['rev-parse', '--git-dir']);
  } catch {
    throw new CLIError(`not a git repository: ${cwd}`, ExitCode.ERROR);
  }
}

/**
 * Resolve a commit-ish to a full sha, converting git's "fatal: ambiguous
 * argument" noise into an actionable message. A raw git stack trace is never
 * what the caller needs here.
 */
function resolveCommit(runGit: RunGit, ref: string): string {
  try {
    return runGit(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
  } catch {
    throw new CLIError(
      `cannot resolve "${ref}" to a commit — check the sha, branch or tag name`,
      ExitCode.ERROR
    );
  }
}

/** Read `[sha, message]` for every commit a range resolves to, oldest first. */
function readRange(runGit: RunGit, range: string): Array<[string, string]> {
  let raw: string;
  try {
    raw = runGit(['log', '--reverse', `--format=%H${FS}%B${RS}`, '--end-of-options', range]);
  } catch {
    throw new CLIError(
      `cannot resolve "${range}" to a commit range — expected e.g. origin/main...HEAD`,
      ExitCode.ERROR
    );
  }
  return raw
    .split(RS)
    .map((record) => record.trim())
    .filter((record) => record !== '')
    .map((record) => {
      const cut = record.indexOf(FS);
      return [record.slice(0, cut), record.slice(cut + 1)] as [string, string];
    });
}

/** Read one commit's full message. */
function readCommitMessage(runGit: RunGit, sha: string): string {
  return runGit(['show', '-s', '--format=%B', '--end-of-options', sha]);
}

/** Shape-check every commit in scope and tally the outcomes. */
function buildCheckReport(
  scope: string,
  commits: ReadonlyArray<[string, string]>
): ProvenanceCheckReport {
  const reports = commits.map(([commit, message]) => ({
    commit,
    ...validateProvenanceTrailer(message),
  }));
  return {
    mode: 'check',
    scope,
    examined: reports.length,
    carried: reports.filter((r) => r.status !== 'absent').length,
    unclaimed: reports.filter((r) => r.status === 'absent').length,
    malformed: reports.filter((r) => r.status === 'malformed').length,
    commits: reports,
  };
}

/** Human-readable key/value block for one parsed trailer. */
function renderTrailerLines(report: ProvenanceCommitReport): string[] {
  const trailer = report.trailer;
  if (trailer === null) return [];
  const K = PROVENANCE_TRAILER_KEYS;
  const pairs: Array<[string, string | undefined]> = [
    [K.run, `${trailer.skill}@${trailer.skillVersion}`],
    [K.version, String(trailer.schemaVersion)],
    [K.runId, trailer.runId],
    [K.lane, trailer.lane],
    [K.agent, trailer.agent],
    [K.model, trailer.model],
    [K.session, trailer.sessionId],
  ];
  const width = Math.max(...pairs.map(([key]) => key.length));
  return pairs
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `  ${key.padEnd(width)}  ${value}`);
}

/** Findings for one commit, rendered as indented bullets. */
function renderFindingLines(report: ProvenanceCommitReport): string[] {
  return [
    ...report.issues.map((i) => `  ! ${i.code} [${i.key}] — ${i.detail}`),
    ...report.warnings.map((w) => `  ~ ${w.code} [${w.key}] — ${w.detail}`),
  ];
}

/** Reader-mode human output. */
function renderRead(report: ProvenanceReadReport): string {
  if (report.status === 'absent') {
    return `no provenance trailer on ${report.commit}\n`;
  }
  const header =
    report.status === 'malformed'
      ? `provenance on ${report.commit} is MALFORMED`
      : `provenance on ${report.commit}`;
  return [header, ...renderTrailerLines(report), ...renderFindingLines(report)].join('\n') + '\n';
}

/**
 * `--check` human output. The counts line is not decoration: a gate that
 * validated nothing must never be mistaken for a gate that validated
 * everything, so the denominator is always stated.
 */
function renderCheck(report: ProvenanceCheckReport): string {
  const lines = [
    `provenance shape gate over ${report.scope}`,
    `  examined ${report.examined} · carried a trailer ${report.carried} ` +
      `· unclaimed ${report.unclaimed} · malformed ${report.malformed}`,
  ];
  for (const commit of report.commits) {
    if (commit.issues.length === 0 && commit.warnings.length === 0) continue;
    lines.push(`${commit.commit} (${commit.status})`, ...renderFindingLines(commit));
  }
  if (report.examined === 0) lines.push('  nothing examined — the range resolved to no commits');
  else if (report.carried === 0) {
    lines.push(
      '  no commit in scope carried a trailer; nothing to shape-check.',
      '  (this gate checks SHAPE only — it never requires a commit to carry one)'
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * Exit code for a finished report.
 *
 * `ZERO_DENOMINATOR` (3) covers the two abstentions: a commit that carries no
 * trailer, and a range that resolved to no commits. Neither examined anything,
 * so neither may read as green. A `--check` scope of real commits that are all
 * unclaimed is NOT an abstention — the gate ran over them and found no
 * malformed trailer.
 */
function exitCodeFor(report: ProvenanceReport): number {
  if (report.mode === 'read') {
    if (report.status === 'absent') return ExitCode.ZERO_DENOMINATOR;
    return report.status === 'malformed' ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS;
  }
  if (report.examined === 0) return ExitCode.ZERO_DENOMINATOR;
  return report.malformed > 0 ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS;
}

/** Gather the report for the requested mode. */
function computeReport(options: ProvenanceCommandOptions, runGit: RunGit): ProvenanceReport {
  if (options.range !== undefined) {
    return buildCheckReport(options.range, readRange(runGit, options.range));
  }
  const sha = resolveCommit(runGit, options.commitish ?? 'HEAD');
  if (options.check === true) {
    return buildCheckReport(sha, [[sha, readCommitMessage(runGit, sha)]]);
  }
  return {
    mode: 'read',
    commit: sha,
    ...validateProvenanceTrailer(readCommitMessage(runGit, sha)),
  };
}

/**
 * Run the command. Returns the report and the exit code the caller should set —
 * it never calls `process.exit`, so tests can assert on both.
 */
export function runProvenanceCommand(options: ProvenanceCommandOptions = {}): {
  report: ProvenanceReport;
  exitCode: number;
} {
  const cwd = options.cwd ?? process.cwd();
  const runGit = options.runGit ?? defaultRunGit(cwd);
  assertGitRepository(runGit, cwd);

  const report = computeReport(options, runGit);
  const text =
    options.json === true
      ? JSON.stringify(report, null, 2) + '\n'
      : report.mode === 'read'
        ? renderRead(report)
        : renderCheck(report);
  process.stdout.write(text);
  return { report, exitCode: exitCodeFor(report) };
}

/** Flags Commander hands the action, before the global `--json` is merged in. */
interface ProvenanceCliFlags {
  range?: string;
  check?: boolean;
}

export function createProvenanceCommand(): Command {
  return (
    new Command('provenance')
      .argument(
        '[commitish]',
        'Commit to read the Harness-* provenance trailer from (default: HEAD)'
      )
      .description(
        'Read the Harness-* provenance trailer for a commit, or shape-check a range ' +
          '(distinct from `harness rules provenance`, the ADR-0100 rule reporter)'
      )
      .option('--check', 'Shape-gate mode: fail on a malformed trailer; skip unclaimed commits.')
      .option('--range <range>', 'Shape-check every commit in a range (e.g. origin/main...HEAD).')
      // Declared so Commander accepts the flag AFTER the subcommand name; the
      // value is read via optsWithGlobals() because the root program declares
      // --json first and shadows this one (issue #2069).
      .option('--json', 'Emit the machine-readable report as JSON.')
      .action((commitish: string | undefined, flags: ProvenanceCliFlags, cmd: CommanderCommand) => {
        const options: ProvenanceCommandOptions = {
          cwd: process.cwd(),
          json: cmd.optsWithGlobals().json === true,
        };
        if (commitish !== undefined) options.commitish = commitish;
        if (flags.range !== undefined) options.range = flags.range;
        if (flags.check === true) options.check = true;
        process.exitCode = runProvenanceCommand(options).exitCode;
      })
  );
}
