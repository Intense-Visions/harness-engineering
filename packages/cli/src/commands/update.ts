import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import readline from 'node:readline';
import chalk from 'chalk';
import { VERSION } from '@harness-engineering/core';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';

type PackageManager = 'npm' | 'pnpm' | 'yarn';

export function detectPackageManager(): PackageManager {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return 'npm';
    const binPath = realpathSync(argv1);

    if (binPath.includes('pnpm/global/') || binPath.includes('pnpm-global/')) {
      return 'pnpm';
    }
    if (binPath.includes('.yarn/')) {
      return 'yarn';
    }
  } catch {
    // Fall through to default
  }
  return 'npm';
}

export function getLatestVersion(): string {
  const output = execSync('npm view @harness-engineering/cli dist-tags.latest', {
    encoding: 'utf-8',
    timeout: 15000,
  });
  return output.trim();
}

export function getInstalledPackages(pm: PackageManager): string[] {
  try {
    const output = execSync(`${pm} list -g --json`, {
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
    .option('--version <semver>', 'Install a specific version instead of latest')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      // 1. Detect package manager
      const pm = detectPackageManager();
      if (globalOpts.verbose) {
        logger.info(`Detected package manager: ${pm}`);
      }

      // 2. Determine target version
      let targetVersion: string;
      if (opts.version) {
        targetVersion = opts.version;
      } else {
        logger.info('Checking for updates...');
        try {
          targetVersion = getLatestVersion();
        } catch {
          logger.error('Failed to fetch latest version from npm registry');
          process.exit(ExitCode.ERROR);
        }
      }

      // 3. Check if already up to date
      if (VERSION === targetVersion) {
        logger.success(`Already up to date (v${VERSION})`);
        process.exit(ExitCode.SUCCESS);
      }

      console.log('');
      logger.info(`Current version: ${chalk.dim(`v${VERSION}`)}`);
      logger.info(`Target version:  ${chalk.green(`v${targetVersion}`)}`);
      console.log('');

      // 4. Discover installed packages
      const packages = getInstalledPackages(pm);
      if (globalOpts.verbose) {
        logger.info(`Installed packages: ${packages.join(', ')}`);
      }

      // 5. Run update
      const installArgs = packages.map((pkg) => `${pkg}@${targetVersion}`).join(' ');
      const installCmd = `${pm} install -g ${installArgs}`;

      if (globalOpts.verbose) {
        logger.info(`Running: ${installCmd}`);
      }

      try {
        logger.info('Updating packages...');
        execSync(installCmd, { stdio: 'inherit', timeout: 120000 });
        console.log('');
        logger.success(`Updated to v${targetVersion}`);
      } catch {
        console.log('');
        logger.error('Update failed. You can try manually:');
        console.log(`  ${chalk.cyan(installCmd)}`);
        process.exit(ExitCode.ERROR);
      }

      // 6. Post-update: offer to regenerate slash commands
      console.log('');
      const regenAnswer = await prompt('Regenerate slash commands? (y/N) ');
      if (regenAnswer === 'y' || regenAnswer === 'yes') {
        const scopeAnswer = await prompt('Generate for (g)lobal or (l)ocal project? (g/l) ');
        const globalFlag = scopeAnswer === 'g' || scopeAnswer === 'global' ? ' --global' : '';
        try {
          execSync(`harness generate-slash-commands${globalFlag}`, { stdio: 'inherit' });
        } catch {
          logger.warn('Slash command generation failed. Run manually:');
          console.log(`  ${chalk.cyan(`harness generate-slash-commands${globalFlag}`)}`);
        }
      }

      process.exit(ExitCode.SUCCESS);
    });
}
