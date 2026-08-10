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
import { readFileSync } from 'node:fs';
import { join, parse as parsePath, resolve } from 'node:path';
import type { Command } from 'commander';
import semver from 'semver';
import { CLI_VERSION } from '../version';
import { ExitCode } from './errors';
import { envEnabled } from './env-flag';
import { resolveCommandPath } from '../bin/command-telemetry';

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
  'check-security',
  'check-docs',
  'check-deps',
  'check-perf',
  'check-harness-strength',
  'cleanup',
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
 * Walk up from `startDir` looking for harness.config.json; fall back to
 * `startDir`. Mirrors the idiom in command-telemetry.ts.
 */
export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  const { root } = parsePath(dir);
  while (dir !== root) {
    try {
      readFileSync(join(dir, 'harness.config.json'), 'utf-8');
      return dir;
    } catch {
      // Not here — keep walking.
    }
    dir = resolve(dir, '..');
  }
  return startDir;
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
  if (range.length === 0 || range === '*' || range === 'x') return undefined;
  if (semver.validRange(range) === null) return undefined;
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
 * @param projectRoot Directory to resolve relative paths against.
 * @param configPathOverride Value of the global `-c/--config` option, when set,
 *   so the guard reads the same config the command will scan with.
 */
export function resolveExpectedVersion(
  projectRoot: string,
  configPathOverride?: string
): ExpectedVersion | undefined {
  const configPath = configPathOverride
    ? resolve(projectRoot, configPathOverride)
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

  if (semver.satisfies(cliVersion, expected.range)) {
    return { status: 'ok', cliVersion, expected, majorDelta: 0, bypassed: false, message: '' };
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
    const commandPath = resolveCommandPath(actionCommand);
    if (!GUARDED_COMMANDS.has(commandPath)) return;

    let configOverride: string | undefined;
    try {
      const opts = actionCommand.optsWithGlobals() as { config?: string };
      configOverride = opts.config;
    } catch {
      configOverride = undefined;
    }

    const projectRoot = findProjectRoot(cwd);
    const result = evaluateVersionGuard(
      CLI_VERSION,
      resolveExpectedVersion(projectRoot, configOverride),
      {
        bypass: envEnabled(process.env['HARNESS_NO_VERSION_GUARD']),
        commandPath,
      }
    );

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
