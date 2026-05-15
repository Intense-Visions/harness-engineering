import { Command } from 'commander';
import { execFile, execFileSync } from 'node:child_process';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import readline from 'node:readline';
import chalk from 'chalk';
import { invalidateCheckState } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { initHooks } from './hooks/init';
import type { HookProfile } from '../hooks/profiles';
import { ensureTelemetryConfigured } from './telemetry-wizard';
import { CLI_VERSION } from '../version';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

const CLI_PACKAGE = '@harness-engineering/cli';

export function detectPackageManagerFromPath(resolvedPath: string): PackageManager {
  // Normalize to forward slashes for cross-platform path matching
  const normalizedBin = resolvedPath.replace(/\\/g, '/');
  if (
    normalizedBin.includes('pnpm/global/') || // eslint-disable-line @harness-engineering/no-hardcoded-path-separator -- platform-safe
    normalizedBin.includes('pnpm-global/')
  ) {
    return 'pnpm';
  }
  if (normalizedBin.includes('.yarn/')) {
    return 'yarn';
  }
  return 'npm';
}

export function detectPackageManager(): PackageManager {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return 'npm';
    return detectPackageManagerFromPath(realpathSync(argv1));
  } catch {
    return 'npm';
  }
}

const execFileAsync = promisify(execFile);

export function getLatestVersion(pkg = '@harness-engineering/cli'): string {
  const output = execFileSync('npm', ['view', pkg, 'dist-tags.latest'], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return output.trim();
}

export async function getLatestVersionAsync(pkg: string): Promise<string> {
  const { stdout } = await execFileAsync('npm', ['view', pkg, 'dist-tags.latest'], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return stdout.trim();
}

export function getInstalledVersion(pm: PackageManager): string | null {
  try {
    const output = execFileSync(pm, ['list', '-g', CLI_PACKAGE, '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(output);
    const deps = data.dependencies ?? {};
    return deps[CLI_PACKAGE]?.version ?? CLI_VERSION;
  } catch {
    return CLI_VERSION;
  }
}

export function getInstalledVersions(
  pm: PackageManager,
  packages: string[]
): Record<string, string | null> {
  const versions: Record<string, string | null> = {};
  try {
    const output = execFileSync(pm, ['list', '-g', '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(output);
    const deps = data.dependencies ?? {};
    for (const pkg of packages) {
      versions[pkg] = deps[pkg]?.version ?? null;
    }
  } catch {
    for (const pkg of packages) {
      versions[pkg] = null;
    }
  }
  // The running CLI is, by definition, installed. When `npm list -g` doesn't
  // see it (Homebrew / bun / asdf install, or a multi-prefix nvm setup), the
  // running package.json's CLI_VERSION is the authoritative current version.
  // Without this fallback, the foreground update check produces a false
  // "All packages are up to date" — see issue #317.
  if (packages.includes(CLI_PACKAGE) && versions[CLI_PACKAGE] === null) {
    versions[CLI_PACKAGE] = CLI_VERSION;
  }
  return versions;
}

export function getInstalledPackages(pm: PackageManager): string[] {
  try {
    const output = execFileSync(pm, ['list', '-g', '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(output);

    // npm: { dependencies: { "pkg": {...} } }
    // pnpm: { dependencies: { "pkg": {...} } } (similar structure)
    const deps = data.dependencies ?? {};
    const found = Object.keys(deps).filter((name) => name.startsWith('@harness-engineering/'));
    // The CLI we are running is always installed, even if `npm list -g` was
    // run against a different prefix and didn't see it (issue #317).
    if (!found.includes(CLI_PACKAGE)) {
      found.unshift(CLI_PACKAGE);
    }
    return found;
  } catch {
    // Fallback: assume the core packages are installed
    return [CLI_PACKAGE, '@harness-engineering/core'];
  }
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

export interface HarnessInstall {
  /** The `harness` entry on PATH (pre-realpath). */
  binPath: string;
  /** Realpath of the entry, useful for deduping symlinks. */
  resolvedBin: string;
  /** Directory containing the install's package.json (the CLI package root). */
  packageDir: string;
  /** Prefix passed to `npm --prefix` for an npm-style install, else null. */
  prefix: string | null;
  /** Version from the install's package.json, or null if unreadable. */
  version: string | null;
  /** Package manager that owns this install, inferred from the path. */
  packageManager: PackageManager;
}

/**
 * Walks up from a resolved binary path to the package root that contains its
 * `package.json`. The CLI's `bin` field points at `dist/bin/harness.js`, so
 * the package root is two `dirname()` calls above `dist/`.
 *
 * Returns null if the expected layout is not found within a few levels.
 */
function findPackageDir(resolvedBin: string): string | null {
  let dir = dirname(resolvedBin);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
        if (pkg?.name === CLI_PACKAGE) return dir;
      } catch {
        // Fall through and continue walking up
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Derives the npm `--prefix` for a CLI package directory by stripping the
 * trailing `lib/node_modules/@harness-engineering/cli` suffix. Returns null
 * if the path doesn't match an npm-style global layout (pnpm/yarn use
 * different shapes and need their own uninstall commands).
 */
function derivePrefix(packageDir: string): string | null {
  const normalized = packageDir.replace(/\\/g, '/');
  const marker = '/lib/node_modules/@harness-engineering/cli';
  if (!normalized.endsWith(marker)) return null;
  return packageDir.slice(0, packageDir.length - marker.length);
}

/**
 * Locates every `harness` binary on PATH and resolves each to its CLI
 * install (binary path, package dir, prefix, version, package manager).
 * Deduplicates by realpath so symlinks don't produce double entries.
 *
 * Returns an empty array when `which`/`where.exe` is unavailable or no
 * harness binary is found on PATH.
 */
export function findAllInstalls(): HarnessInstall[] {
  const isWindows = process.platform === 'win32';
  const cmd = isWindows ? 'where' : 'which';
  const args = isWindows ? ['harness'] : ['-a', 'harness'];

  let output: string;
  try {
    const raw = execFileSync(cmd, args, { encoding: 'utf-8', timeout: 5000 });
    if (typeof raw !== 'string') return [];
    output = raw;
  } catch {
    return [];
  }

  const paths = output
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const installs: HarnessInstall[] = [];

  for (const binPath of paths) {
    let resolved: string;
    try {
      resolved = realpathSync(binPath);
    } catch {
      continue;
    }
    if (seen.has(resolved)) continue;
    seen.add(resolved);

    const packageDir = findPackageDir(resolved);
    if (!packageDir) continue;

    let version: string | null = null;
    try {
      const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
      if (typeof pkg?.version === 'string') version = pkg.version;
    } catch {
      // Leave version null
    }

    installs.push({
      binPath,
      resolvedBin: resolved,
      packageDir,
      prefix: derivePrefix(packageDir),
      version,
      packageManager: detectPackageManagerFromPath(resolved),
    });
  }

  return installs;
}

/**
 * Returns the package dir of the actively-running CLI (so callers can split
 * `findAllInstalls()` results into "active" and "stale"). Returns null when
 * `process.argv[1]` is missing or unreadable.
 */
export function getActiveInstallDir(): string | null {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return null;
    return findPackageDir(realpathSync(argv1));
  } catch {
    return null;
  }
}

/**
 * Surfaces every other `harness` install on PATH after the active one has
 * been updated. If the user accepts the prompt, runs the appropriate
 * uninstall command for each. Failures are reported but do not abort.
 */
async function offerCleanupOfOtherInstalls(activeDir: string | null): Promise<void> {
  const installs = findAllInstalls();
  if (installs.length <= 1) return;

  const others = installs.filter((i) => i.packageDir !== activeDir);
  if (others.length === 0) return;

  console.log('');
  logger.warn(
    `Found ${installs.length} harness installs on PATH. Only the active one was updated.`
  );
  for (const install of installs) {
    const tag =
      install.packageDir === activeDir
        ? chalk.green(' (active, just updated)')
        : chalk.yellow(' (stale)');
    const versionStr = install.version ? `v${install.version}` : 'unknown';
    console.log(`  ${install.binPath} -> ${versionStr}${tag}`);
  }
  console.log('');

  const commands = others.map((install) => buildUninstallCommand(install));
  console.log('Cleanup commands:');
  for (const { display } of commands) {
    console.log(`  ${chalk.cyan(display)}`);
  }
  console.log('');

  const answer = await prompt(`Run these now to remove stale installs? (y/N) `);
  if (answer !== 'y' && answer !== 'yes') return;

  for (const cmd of commands) {
    if (!cmd.runnable) {
      logger.warn(`Skipped ${cmd.install.binPath} (no automatic uninstall for this layout).`);
      console.log(`  Run manually: ${chalk.cyan(cmd.display)}`);
      continue;
    }
    try {
      logger.info(`Uninstalling: ${cmd.display}`);
      execFileSync(cmd.bin, cmd.args, { stdio: 'inherit', timeout: 120000 });
    } catch {
      logger.warn(`Uninstall failed for ${cmd.install.binPath}.`);
      console.log(`  Run manually: ${chalk.cyan(cmd.display)}`);
    }
  }
}

interface UninstallCommand {
  install: HarnessInstall;
  runnable: boolean;
  bin: string;
  args: string[];
  display: string;
}

function buildUninstallCommand(install: HarnessInstall): UninstallCommand {
  if (install.packageManager === 'npm' && install.prefix) {
    const args = [`--prefix=${install.prefix}`, 'uninstall', '-g', CLI_PACKAGE];
    return {
      install,
      runnable: true,
      bin: 'npm',
      args,
      display: `npm ${args.join(' ')}`,
    };
  }
  // pnpm/yarn globals live in user-specific directories that the active PM
  // doesn't necessarily target via a flag. Print the command but don't run it.
  const pmCmd = install.packageManager === 'yarn' ? 'yarn global remove' : 'pnpm remove -g';
  return {
    install,
    runnable: false,
    bin: install.packageManager,
    args: [],
    display: `${pmCmd} ${CLI_PACKAGE}`,
  };
}

async function ensureTelemetryIfNeeded(): Promise<void> {
  const cwd = process.cwd();
  const result = await ensureTelemetryConfigured(cwd);
  if (result.status === 'pass') {
    logger.success(result.message);
  } else if (result.status === 'warn') {
    logger.warn(result.message);
  }
}

function refreshHooks(): void {
  const cwd = process.cwd();
  const configPath = join(cwd, 'harness.config.json');
  if (!existsSync(configPath)) return;

  // Detect existing profile or default to standard
  let profile: HookProfile = 'standard';
  const profilePath = join(cwd, '.harness', 'hooks', 'profile.json');
  try {
    const data = JSON.parse(readFileSync(profilePath, 'utf-8'));
    if (data.profile && ['minimal', 'standard', 'strict'].includes(data.profile)) {
      profile = data.profile;
    }
  } catch {
    // No existing profile — use standard
  }

  try {
    const result = initHooks({ profile, projectDir: cwd });
    logger.success(`Refreshed ${result.copiedScripts.length} hooks (${profile} profile)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Hook refresh failed: ${msg}`);
  }
}

function runLocalGraphScan(): void {
  try {
    logger.info('Scanning codebase to rebuild knowledge graph...');
    execFileSync('harness', ['graph', 'scan', '.'], { stdio: 'inherit' });
  } catch {
    logger.warn('Graph scan failed. Run manually:');
    console.log(`  ${chalk.cyan('harness graph scan .')}`);
  }
}

async function offerRegeneration(): Promise<void> {
  console.log('');
  const regenAnswer = await prompt(
    'Regenerate slash commands, agent definitions, and knowledge graph? (Y/n) '
  );
  if (regenAnswer === 'n' || regenAnswer === 'no') return;

  const scopeAnswer = await prompt('Generate for (G)lobal or (l)ocal project? (G/l) ');
  const isGlobal = scopeAnswer !== 'l' && scopeAnswer !== 'local';
  try {
    execFileSync('harness', ['generate', ...(isGlobal ? ['--global'] : [])], {
      stdio: 'inherit',
    });
  } catch {
    logger.warn('Generation failed. Run manually:');
    console.log(`  ${chalk.cyan(`harness generate${isGlobal ? ' --global' : ''}`)}`);
  }

  if (!isGlobal) {
    runLocalGraphScan();
  }
}

interface UpdateCheckResult {
  hasUpdates: boolean;
  outdated: Array<{ pkg: string; current: string | null; latest: string }>;
}

async function checkAllPackages(
  packages: string[],
  installedVersions: Record<string, string | null>
): Promise<UpdateCheckResult> {
  logger.info('Checking for updates...');

  const results = await Promise.allSettled(
    packages.map(async (pkg) => {
      const latest = await getLatestVersionAsync(pkg);
      const current = installedVersions[pkg] ?? null;
      return { pkg, current, latest, outdated: !current || current !== latest };
    })
  );

  const outdated: UpdateCheckResult['outdated'] = [];
  for (const result of results) {
    if (result.status === 'rejected') {
      // Skip packages we can't query — don't block the whole update
      continue;
    }
    if (result.value.outdated) {
      outdated.push(result.value);
    }
  }

  return { hasUpdates: outdated.length > 0, outdated };
}

function buildInstallPackages(
  packages: string[],
  opts: { version?: string }
): { installPkgs: string[]; installCmd: string; pm: PackageManager } {
  const pm = detectPackageManager();
  const installPkgs = packages.map((pkg) => {
    if (opts.version && pkg === '@harness-engineering/cli') {
      return `${pkg}@${opts.version}`;
    }
    return `${pkg}@latest`;
  });
  const installCmd = `${pm} install -g ${installPkgs.join(' ')}`;
  return { installPkgs, installCmd, pm };
}

async function runUpdateAction(
  opts: { version?: string; force?: boolean; regenerate?: boolean },
  globalOpts: Record<string, unknown>
): Promise<void> {
  // 1. Detect package manager
  const pm = detectPackageManager();
  if (globalOpts.verbose) {
    logger.info(`Detected package manager: ${pm}`);
  }

  // 2. Discover installed packages and their versions
  const packages = getInstalledPackages(pm);
  if (globalOpts.verbose) {
    logger.info(`Installed packages: ${packages.join(', ')}`);
  }

  // 3. Regenerate-only mode: skip package updates entirely
  if (opts.regenerate) {
    await offerRegeneration();
    process.exit(ExitCode.SUCCESS);
  }

  // 4. Check ALL installed packages for updates (not just CLI)
  if (!opts.version && !opts.force) {
    const installedVersions = getInstalledVersions(pm, packages);
    const { hasUpdates, outdated } = await checkAllPackages(packages, installedVersions);

    if (!hasUpdates) {
      logger.success('All packages are up to date');
      // Still refresh hooks, check telemetry, surface duplicate installs,
      // and offer regeneration.
      refreshHooks();
      await ensureTelemetryIfNeeded();
      // Even when the active install is current, stale duplicates on PATH
      // can cause `which harness` to resolve to an older binary — that's
      // the "no chance of multiple versions" guarantee this offer covers.
      await offerCleanupOfOtherInstalls(getActiveInstallDir());
      await offerRegeneration();
      process.exit(ExitCode.SUCCESS);
    }

    console.log('');
    for (const { pkg, current, latest } of outdated) {
      const shortName = pkg.replace('@harness-engineering/', '');
      const currentStr = current ? chalk.dim(`v${current}`) : chalk.dim('not installed');
      logger.info(`${shortName}: ${currentStr} → ${chalk.green(`v${latest}`)}`);
    }
    console.log('');
  }

  // 5. Build install command — each package gets @latest, except CLI if --version is specified
  const { installPkgs, installCmd } = buildInstallPackages(packages, opts);

  if (globalOpts.verbose) {
    logger.info(`Running: ${installCmd}`);
  }

  try {
    logger.info('Updating packages...');
    execFileSync(pm, ['install', '-g', ...installPkgs], { stdio: 'inherit', timeout: 120000 });
    console.log('');
    logger.success('Update complete');
    // Cached "Update available" state predates the install — drop it so
    // the next CLI invocation doesn't print a stale notification before
    // the next background refresh runs.
    invalidateCheckState();
  } catch {
    console.log('');
    logger.error('Update failed. You can try manually:');
    console.log(`  ${chalk.cyan(installCmd)}`);
    process.exit(ExitCode.ERROR);
  }

  // 6. Refresh hook scripts to match updated package version
  refreshHooks();

  // 7. Ensure telemetry is configured
  await ensureTelemetryIfNeeded();

  // 8. Surface any other harness installs on PATH and offer cleanup.
  await offerCleanupOfOtherInstalls(getActiveInstallDir());

  // 9. Post-update: offer to regenerate slash commands + agent definitions
  await offerRegeneration();

  process.exit(ExitCode.SUCCESS);
}

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update all @harness-engineering packages to the latest version')
    .option('--version <semver>', 'Pin @harness-engineering/cli to a specific version')
    .option('--force', 'Force update even if versions match')
    .option(
      '--regenerate',
      'Only regenerate slash commands and agent definitions (skip package updates)'
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      await runUpdateAction(opts, globalOpts);
    });
}
