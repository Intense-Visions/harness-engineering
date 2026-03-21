import { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import readline from 'node:readline';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

export function detectPackageManager(): PackageManager {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return 'npm';
    const binPath = realpathSync(argv1);

    // Normalize to forward slashes for cross-platform path matching
    const normalizedBin = binPath.replace(/\\/g, '/');
    if (
      normalizedBin.includes('pnpm/global/') || // platform-safe: already normalized
      normalizedBin.includes('pnpm-global/')
    ) {
      return 'pnpm';
    }
    if (normalizedBin.includes('.yarn/')) {
      // platform-safe: already normalized
      return 'yarn';
    }
  } catch {
    // Fall through to default
  }
  return 'npm';
}

export function getLatestVersion(pkg = '@harness-engineering/cli'): string {
  const output = execFileSync('npm', ['view', pkg, 'dist-tags.latest'], {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return output.trim();
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

export function createUpdateCommand(): Command {
  return new Command('update')
    .description('Update all @harness-engineering packages to the latest version')
    .option('--version <semver>', 'Pin @harness-engineering/cli to a specific version')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      // 1. Detect package manager
      const pm = detectPackageManager();
      if (globalOpts.verbose) {
        logger.info(`Detected package manager: ${pm}`);
      }

      // 2. Check if already up to date (CLI package only)
      const currentVersion = getInstalledVersion(pm);
      let latestCliVersion: string | undefined;

      if (!opts.version) {
        logger.info('Checking for updates...');
        try {
          latestCliVersion = getLatestVersion();
        } catch {
          logger.error('Failed to fetch latest version from npm registry');
          return process.exit(ExitCode.ERROR);
        }

        if (currentVersion && currentVersion === latestCliVersion) {
          logger.success(`Already up to date (v${currentVersion})`);
          process.exit(ExitCode.SUCCESS);
        }

        if (currentVersion) {
          console.log('');
          logger.info(`Current CLI version: ${chalk.dim(`v${currentVersion}`)}`);
          logger.info(`Latest CLI version:  ${chalk.green(`v${latestCliVersion}`)}`);
          console.log('');
        }
      }

      // 3. Discover installed packages
      const packages = getInstalledPackages(pm);
      if (globalOpts.verbose) {
        logger.info(`Installed packages: ${packages.join(', ')}`);
      }

      // 4. Build install command — each package gets @latest, except CLI if --version is specified
      const installPkgs = packages.map((pkg) => {
        if (opts.version && pkg === '@harness-engineering/cli') {
          return `${pkg}@${opts.version}`;
        }
        return `${pkg}@latest`;
      });
      const installCmd = `${pm} install -g ${installPkgs.join(' ')}`;

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

      // 6. Post-update: offer to regenerate slash commands + agent definitions
      console.log('');
      const regenAnswer = await prompt('Regenerate slash commands and agent definitions? (y/N) ');
      if (regenAnswer === 'y' || regenAnswer === 'yes') {
        const scopeAnswer = await prompt('Generate for (g)lobal or (l)ocal project? (g/l) ');
        const isGlobal = scopeAnswer === 'g' || scopeAnswer === 'global';
        try {
          execFileSync('harness', ['generate', ...(isGlobal ? ['--global'] : [])], {
            stdio: 'inherit',
          });
        } catch {
          logger.warn('Generation failed. Run manually:');
          console.log(`  ${chalk.cyan(`harness generate${isGlobal ? ' --global' : ''}`)}`);
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}
