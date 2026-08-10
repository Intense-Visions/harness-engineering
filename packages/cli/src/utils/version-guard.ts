/**
 * Toolchain version guard.
 *
 * A scanner that predates the rules it evaluates does not fail — it emits
 * well-formed, confident, wrong output. An older CLI re-reports findings the
 * workspace has already justified and suppressed, and every consumer downstream
 * treats that output as evidence.
 *
 * This module decides whether the running CLI is far enough out of step with the
 * workspace it is pointed at that it should refuse to produce findings at all.
 *
 * It is deliberately I/O- and side-effect-light: {@link evaluateVersionGuard} is
 * a pure function of its arguments (no `process.env`, no `process.cwd()`), and
 * {@link resolveExpectedVersion} does nothing but two error-swallowing file
 * reads. Nothing here prints or exits — that is {@link installVersionGuard}'s
 * job, which keeps the decision logic directly unit-testable.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, parse as parsePath, resolve } from 'node:path';
import type { Command } from 'commander';
import semver from 'semver';
import { CLI_VERSION } from '../version';
import { ExitCode } from './errors';
import { envEnabled } from './env-flag';

/** The published package whose version a workspace pins. */
const CLI_PACKAGE = '@harness-engineering/cli';

/**
 * Sentinel emitted by `version.ts` when it cannot resolve its own package.json.
 * Never gate on it — a packaging regression must not become a blanket refusal.
 */
const UNRESOLVED_CLI_VERSION = '0.0.0';

/**
 * Commands whose output is a findings list that a human or an orchestrator will
 * act on. These are the only commands the guard gates.
 *
 * `doctor`, `update`, `setup`, and `init` are deliberately absent: those are the
 * commands you need when your toolchain is wrong, and a guard that blocks its
 * own remedy is a trap.
 *
 * Matched against the prefix-free dotted path, so nested commands that share a
 * leaf name (`skill validate`, `perf update`) resolve to `skill.validate` /
 * `perf.update` and cannot collide with these top-level entries.
 */
export const GUARDED_COMMANDS: ReadonlySet<string> = new Set([
  // Every command that emits the `--findings-json` contract. That flag is the
  // objective definition of "findings-producing" in this repo: it is the machine
  // -readable output an orchestrator parses and schedules on, which is exactly
  // what went wrong when a stale scanner produced it.
  'check-arch',
  'check-deployment',
  'check-deps',
  'check-docs',
  'check-security',
  'cleanup',
  'cross-check',
  // Findings-producing without the contract flag.
  'check-perf',
  'check-harness-strength',
  'validate',
  'review-ci',
]);

export type VersionGuardStatus = 'ok' | 'unknown' | 'warn' | 'refuse';
export type ExpectedVersionSource = 'config' | 'dependency';

export interface ExpectedVersion {
  /** The semver range as written by the workspace. Always a valid range. */
  range: string;
  source: ExpectedVersionSource;
  /** Human-readable origin, used in the message (e.g. "harness.config.json"). */
  origin: string;
}

export interface VersionGuardResult {
  status: VersionGuardStatus;
  cliVersion: string;
  expected?: ExpectedVersion;
  /** `minVersion(range).major - major(cliVersion)`. Absent when `unknown`. */
  majorDelta?: number;
  /**
   * True when a refusal was downgraded by the escape hatch. When set, `status`
   * is already rewritten to `'warn'` — callers branch on `status` alone, so the
   * bypass is expressed there rather than as a flag callers must remember.
   */
  bypassed: boolean;
  /** Empty string when `ok` or `unknown`. */
  message: string;
}

/**
 * Resolve a command's dotted path with NO namespace prefix
 * (e.g. "validate", "graph.scan").
 *
 * `command-telemetry.ts` has a near-identical traversal, but it returns a
 * `cli/`-prefixed name — that prefix is telemetry's own namespace, separating
 * CLI adoption records from hook records. The guard matches against bare command
 * names, so inheriting the prefix would make every `GUARDED_COMMANDS.has()` test
 * false and turn this guard into a permanently silent no-op.
 *
 * The two are kept separate rather than unified because collapsing them means
 * editing telemetry, which drags an unrelated pre-existing security annotation
 * into this change's review surface. Unifying them is a worthwhile follow-up,
 * not a prerequisite.
 */
export function resolveCommandPath(cmd: Command): string {
  const parts: string[] = [];
  let current: Command | null = cmd;
  while (current) {
    const name = current.name();
    if (name && name !== 'harness') {
      parts.unshift(name);
    }
    current = current.parent;
  }
  return parts.join('.');
}

/**
 * Walk up from `startDir` looking for harness.config.json; fall back to
 * `startDir`. Mirrors the idiom in command-telemetry.ts.
 */
export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  const { root } = parsePath(dir);
  while (dir !== root) {
    // existsSync, not readFileSync — this is an existence probe, and reading
    // then discarding a whole config on every level is pointless work.
    if (existsSync(join(dir, 'harness.config.json'))) return dir;
    dir = resolve(dir, '..');
  }
  return resolve(startDir);
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A range is usable only if semver can parse it AND it says something specific.
 *
 * `semver.minVersion` THROWS on package-manager protocols (`workspace:*`,
 * `file:../cli`, `latest`) and returns null on an unsatisfiable range
 * (`>=11 <10`). Letting either reach the ladder would raise inside a commander
 * preAction hook and brick every guarded command on a typo'd pin — strictly
 * worse than the drift the guard prevents.
 *
 * `*` parses fine but its minimum is 0.0.0, which would refuse every CLI. It is
 * uninformative, not a pin, so it is filtered too.
 */
function usableRange(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const range = raw.trim();
  if (range.length === 0) return undefined;
  const normalized = semver.validRange(range);
  if (normalized === null) return undefined;
  // `semver` normalizes every any-version spelling — `*`, `x`, `X`, `||`,
  // `>=0`, `0.x`, `^0`, `~0` — to the single token `*`. Comparing the
  // normalized form catches them all; string-matching the raw input would miss
  // most. An any-version range is not a pin and cannot express a mismatch.
  if (normalized === '*') return undefined;
  return range;
}

/**
 * Resolve the CLI version range this workspace expects.
 *
 * Precedence: an explicit `toolchain.cliVersion` pin in harness.config.json
 * beats a `@harness-engineering/cli` range inferred from package.json — one is a
 * statement of intent, the other an artifact of package management.
 *
 * The config file is read directly rather than through `resolveConfig`, which
 * writes stripped-key warnings to stderr (the guard must stay silent) and
 * searches from `process.cwd()` rather than the root it is handed.
 *
 * @param projectRoot Directory holding harness.config.json / package.json.
 * @param configPathOverride Value of the global `-c/--config` option, when set,
 *   so the guard reads the same config the command will scan with.
 * @param cwd Base for resolving `configPathOverride`. It must be the process
 *   working directory, NOT `projectRoot`: `loadConfig` hands the flag straight
 *   to `readFileSync`, so `-c ./ci.config.json` is cwd-relative. Resolving it
 *   against the walked-up root would make the guard read a different file than
 *   the command — and on the resulting ENOENT it would fall through to
 *   `unknown`, so passing `-c` would silently *disable* the guard.
 */
export function resolveExpectedVersion(
  projectRoot: string,
  configPathOverride?: string,
  cwd: string = process.cwd()
): ExpectedVersion | undefined {
  const configPath = configPathOverride
    ? resolve(cwd, configPathOverride)
    : join(projectRoot, 'harness.config.json');

  const config = readJson(configPath);
  const toolchain = config?.['toolchain'];
  if (typeof toolchain === 'object' && toolchain !== null) {
    const pinned = usableRange((toolchain as Record<string, unknown>)['cliVersion']);
    if (pinned) {
      // Name the file actually read — with `-c` that is not harness.config.json,
      // and a message pointing at the wrong file sends the reader hunting.
      return {
        range: pinned,
        source: 'config',
        origin: configPathOverride ? configPath : 'harness.config.json',
      };
    }
  }

  const pkg = readJson(join(projectRoot, 'package.json'));
  if (pkg) {
    for (const field of ['devDependencies', 'dependencies'] as const) {
      const deps = pkg[field];
      if (typeof deps !== 'object' || deps === null) continue;
      const declared = usableRange((deps as Record<string, unknown>)[CLI_PACKAGE]);
      if (declared) {
        return {
          range: declared,
          source: 'dependency',
          origin: `package.json ${field}.${CLI_PACKAGE}`,
        };
      }
    }
  }

  return undefined;
}

function buildMessage(
  verb: string,
  commandPath: string,
  cliVersion: string,
  expected: ExpectedVersion,
  majorDelta: number,
  bypassed: boolean
): string {
  const behind =
    majorDelta > 0
      ? `A scanner ${majorDelta} major version${majorDelta === 1 ? '' : 's'} behind will ` +
        'report findings this workspace has already resolved.'
      : 'The running CLI does not satisfy the version this workspace declares.';

  const lines = [
    `harness: ${verb} \`${commandPath}\`.`,
    '',
    `  This CLI is v${cliVersion}, but the workspace expects ${expected.range} (${expected.origin}).`,
    `  ${behind}`,
    '',
    `  Running binary: ${process.argv[1] ?? '(unknown)'}`,
    `  Node:           ${process.execPath}`,
    '',
    '  Check `which -a harness` — a Node bin directory added to PATH may be',
    '  shadowing the intended install.',
    '',
  ];

  if (bypassed) {
    lines.push('  HARNESS_NO_VERSION_GUARD is set, so this is a warning rather than a refusal.');
  } else {
    lines.push('  To run anyway (the warning stays): HARNESS_NO_VERSION_GUARD=1');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Decide whether the running CLI may produce findings for this workspace.
 *
 * The ladder is asymmetric on purpose. Staleness is the dangerous direction: an
 * older scanner re-reports findings the workspace already justified (falsehood),
 * while a newer one reports rules the workspace has not adopted yet (noise).
 * Noise warns; falsehood, at sufficient distance, refuses.
 *
 * One major behind only warns because that is the normal state of a repository
 * partway through an upgrade — refusing there would turn a safety net into an
 * outage and guarantee the guard gets disabled wholesale.
 */
export function evaluateVersionGuard(
  cliVersion: string,
  expected: ExpectedVersion | undefined,
  opts: { bypass?: boolean; commandPath?: string } = {}
): VersionGuardResult {
  const unknown: VersionGuardResult = {
    status: 'unknown',
    cliVersion,
    // Spread rather than assign: `exactOptionalPropertyTypes` forbids setting an
    // optional property to an explicit `undefined`.
    ...(expected ? { expected } : {}),
    bypassed: false,
    message: '',
  };

  // Nothing to compare against. Stay silent rather than nagging every project
  // that has not opted in — a guard everyone learns to ignore protects nobody.
  if (!expected) return unknown;

  // A CLI that could not resolve its own version must never gate.
  if (cliVersion === UNRESOLVED_CLI_VERSION || semver.valid(cliVersion) === null) {
    return unknown;
  }

  // Enforce the "always a valid range" invariant HERE, at the public boundary
  // that documents it, not only inside resolveExpectedVersion. Both functions
  // are exported, and a caller that builds an ExpectedVersion itself would
  // otherwise reach semver.minVersion, which THROWS on 'latest' / 'workspace:*'.
  // semver.satisfies swallows a bad range and returns false, so it is no shield.
  if (semver.validRange(expected.range) === null) return unknown;

  // includePrerelease so a prerelease CLI newer than the pin is not perpetually
  // warned at. Without it, satisfies('12.0.0-rc.0', '>=11') is false, and every
  // RC tester would see a spurious warning on every scan — precisely the
  // "train everyone to ignore the guard" outcome the silent-when-unknown rule
  // exists to avoid.
  if (semver.satisfies(cliVersion, expected.range, { includePrerelease: true })) {
    const lowerBound = semver.minVersion(expected.range);
    return {
      status: 'ok',
      cliVersion,
      expected,
      // Report the true distance, not a hardcoded 0. `doctor` is the named next
      // consumer, and an advisory claiming "0 majors apart" while the CLI is 3
      // ahead is the same confidently-wrong output this guard exists to stop.
      ...(lowerBound ? { majorDelta: lowerBound.major - semver.major(cliVersion) } : {}),
      bypassed: false,
      message: '',
    };
  }

  const minimum = semver.minVersion(expected.range);
  if (!minimum) return unknown;

  const majorDelta = minimum.major - semver.major(cliVersion);
  const bypassed = majorDelta >= 2 && opts.bypass === true;
  const status: VersionGuardStatus = majorDelta >= 2 && !bypassed ? 'refuse' : 'warn';
  const verb = status === 'refuse' ? 'refusing to run' : 'version mismatch running';

  return {
    status,
    cliVersion,
    expected,
    majorDelta,
    bypassed,
    message: buildMessage(
      verb,
      opts.commandPath ?? 'this command',
      cliVersion,
      expected,
      majorDelta,
      bypassed
    ),
  };
}

/**
 * Install the guard as a root-level `preAction` hook.
 *
 * Installed from `createProgram()` rather than from `bin/harness.ts` (where
 * telemetry is installed) so that the program object `createProgram()` returns
 * is already guarded for every consumer.
 *
 * Commander runs ancestor `preAction` hooks before descendant ones, so this
 * fires before a command's own hooks. Exiting from inside a hook has direct
 * precedent in `commands/check-security.ts`.
 */
export function installVersionGuard(program: Command, cwd: string): void {
  // program.hook() may not exist in test environments.
  if (typeof program.hook !== 'function') return;

  program.hook('preAction', (_thisCommand, actionCommand) => {
    let result: VersionGuardResult;
    try {
      const commandPath = resolveCommandPath(actionCommand);
      if (!GUARDED_COMMANDS.has(commandPath)) return;

      const opts = actionCommand.optsWithGlobals() as { config?: unknown };
      // Narrow rather than assert: a subcommand declaring `--config` as a
      // boolean flag would otherwise reach resolve(root, true) and throw.
      const configOverride = typeof opts.config === 'string' ? opts.config : undefined;

      const projectRoot = findProjectRoot(cwd);
      result = evaluateVersionGuard(
        CLI_VERSION,
        resolveExpectedVersion(projectRoot, configOverride, cwd),
        {
          bypass: envEnabled(process.env['HARNESS_NO_VERSION_GUARD']),
          commandPath,
        }
      );
    } catch {
      // A broken guard must never break the CLI. Refusing to scan is a
      // deliberate act; crashing on the way to deciding is not one.
      return;
    }

    if (result.status === 'warn') {
      process.stderr.write(result.message);
      return;
    }

    if (result.status === 'refuse') {
      process.stderr.write(result.message);
      // ZERO_DENOMINATOR, not VALIDATION_FAILED: the command examined nothing.
      // Exit 1 is what these commands return when they found REAL findings, and
      // a refusal must never be mistaken for a completed scan.
      process.exit(ExitCode.ZERO_DENOMINATOR);
    }
  });
}
