# Plan: CLI Self-Update Command

**Date:** 2026-03-17
**Spec:** docs/specs/2026-03-17-cli-self-update-design.md
**Estimated tasks:** 3
**Estimated time:** 10-15 minutes

## Goal

`harness update` updates all globally installed `@harness-engineering/*` packages to the latest (or pinned) version and optionally regenerates slash commands.

## Observable Truths (Acceptance Criteria)

1. When `harness update` is run, the system shall detect the package manager, fetch the latest version, and install all `@harness-engineering/*` packages globally.
2. When `harness update --version 1.3.0` is run, the system shall install all packages at version `1.3.0`.
3. When the installed version matches the target version, the system shall print "Already up to date" and exit successfully.
4. When the update succeeds, the system shall prompt to regenerate slash commands with global/local choice.
5. When package manager detection fails, the system shall fall back to npm.
6. The `createUpdateCommand()` function shall be exported and registered in `createProgram()`.

## File Map

- CREATE `packages/cli/src/commands/update.ts`
- CREATE `packages/cli/tests/commands/update.test.ts`
- MODIFY `packages/cli/src/index.ts` (import + register command)

## Tasks

### Task 1: Create update command with PM detection, version check, and update logic

**Depends on:** none
**Files:** `packages/cli/src/commands/update.ts`

1. Create `packages/cli/src/commands/update.ts`:

```typescript
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
    const binPath = realpathSync(process.argv[1]);

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
```

2. Run: `harness validate`
3. Commit: `feat(cli): add update command with PM detection and version pinning`

---

### Task 2: Add tests for update command utilities

**Depends on:** Task 1
**Files:** `packages/cli/tests/commands/update.test.ts`

1. Create `packages/cli/tests/commands/update.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectPackageManager, createUpdateCommand } from '../../src/commands/update';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock node:fs
vi.mock('node:fs', () => ({
  realpathSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

const mockedExecSync = vi.mocked(execSync);
const mockedRealpathSync = vi.mocked(realpathSync);

describe('update command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUpdateCommand', () => {
    it('creates command with correct name', () => {
      const cmd = createUpdateCommand();
      expect(cmd.name()).toBe('update');
    });

    it('has --version option', () => {
      const cmd = createUpdateCommand();
      const opt = cmd.options.find((o) => o.long === '--version');
      expect(opt).toBeDefined();
    });

    it('has description', () => {
      const cmd = createUpdateCommand();
      expect(cmd.description()).toContain('Update');
    });
  });

  describe('detectPackageManager', () => {
    it('detects npm from path containing /lib/node_modules/', () => {
      mockedRealpathSync.mockReturnValue(
        '/usr/local/lib/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('npm');
    });

    it('detects pnpm from path containing pnpm/global/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/.local/share/pnpm/global/5/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('detects pnpm from path containing pnpm-global/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/pnpm-global/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('pnpm');
    });

    it('detects yarn from path containing .yarn/', () => {
      mockedRealpathSync.mockReturnValue(
        '/home/user/.yarn/global/node_modules/@harness-engineering/cli/dist/bin/harness.js'
      );
      expect(detectPackageManager()).toBe('yarn');
    });

    it('falls back to npm when path has no recognizable pattern', () => {
      mockedRealpathSync.mockReturnValue('/some/unknown/path/harness.js');
      expect(detectPackageManager()).toBe('npm');
    });

    it('falls back to npm when realpathSync throws', () => {
      mockedRealpathSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      expect(detectPackageManager()).toBe('npm');
    });
  });
});
```

2. Run test: `cd packages/cli && npx vitest run tests/commands/update.test.ts`
3. Observe: all 9 tests pass
4. Run: `harness validate`
5. Commit: `test(cli): add tests for update command`

---

### Task 3: Register update command in CLI program

**Depends on:** Task 1
**Files:** `packages/cli/src/index.ts`

1. Add import to `packages/cli/src/index.ts` after line 19 (`import { createCICommand }`):

```typescript
import { createUpdateCommand } from './commands/update';
```

2. Add registration after line 50 (`program.addCommand(createCICommand())`):

```typescript
program.addCommand(createUpdateCommand());
```

3. Run: `cd packages/cli && npx vitest run tests/commands/update.test.ts`
4. Run: `harness validate`
5. Commit: `feat(cli): register update command`

---

## Traceability

| Observable Truth | Task(s) |
|-----------------|---------|
| 1. Detect PM + install packages | Task 1 (detectPackageManager, getInstalledPackages, install logic) |
| 2. `--version` flag pins version | Task 1 (opts.version handling) |
| 3. Already up to date message | Task 1 (VERSION === targetVersion check) |
| 4. Slash command regen prompt | Task 1 (post-update prompt section) |
| 5. Falls back to npm | Task 1 (detectPackageManager default), Task 2 (tests) |
| 6. Registered in createProgram | Task 3 |
