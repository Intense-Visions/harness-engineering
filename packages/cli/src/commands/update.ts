import { Command } from 'commander';
import { execFile, execFileSync } from 'node:child_process';
import { realpathSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import readline from 'node:readline';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
import { initHooks } from './hooks/init';
import type { HookProfile } from '../hooks/profiles';
import { ensureTelemetryConfigured } from './telemetry-wizard';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

export function detectPackageManager(): PackageManager {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return 'npm';
    const binPath = realpathSync(argv1);

    // Normalize to forward slashes for cross-platform path matching
    const normalizedBin = binPath.replace(/\\/g, '/');
    if (
      normalizedBin.includes('pnpm/global/') || // eslint-disable-line @harness-engineering/no-hardcoded-path-separator -- platform-safe
      normalizedBin.includes('pnpm-global/')
    ) {
      return 'pnpm';
    }
    if (normalizedBin.includes('.yarn/')) {
      return 'yarn';
    }
  } catch {
    // Fall through to default
  }
  return 'npm';
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
    const output = execFileSync(pm, ['list', '-g', '@harness-engineering/cli', '--json'], {
      encoding: 'utf-8',
      timeout: 15000,
    });
    const data = JSON.parse(output);
    const deps = data.dependencies ?? {};
    return deps['@harness-engineering/cli']?.version ?? null;
  } catch {
    return null;
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
    return Object.keys(deps).filter((name) => name.startsWith('@harness-engineering/'));
  } catch {
    // Fallback: assume the core packages are installed
    return ['@harness-engineering/cli', '@harness-engineering/core'];
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
      // Still refresh hooks, check telemetry, and offer regeneration
      refreshHooks();
      await ensureTelemetryIfNeeded();
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

  // 8. Post-update: offer to regenerate slash commands + agent definitions
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
