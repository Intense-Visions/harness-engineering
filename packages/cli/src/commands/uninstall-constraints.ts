import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import {
  readLockfile,
  writeLockfile,
  removeProvenance,
  removeContributions,
  writeConfig,
} from '@harness-engineering/core';
import type { Contributions } from '@harness-engineering/core';
import { findConfigFile } from '../config/loader';
import { logger } from '../output/logger';
import type { Result } from '@harness-engineering/types';

// --- Types ---

export interface UninstallConstraintsOptions {
  packageName: string;
  configPath: string;
  lockfilePath: string;
}

export interface UninstallConstraintsSuccess {
  removed: boolean;
  packageName: string;
  version: string;
  sectionsRemoved: string[];
}

// --- Core orchestration ---

export async function runUninstallConstraints(
  options: UninstallConstraintsOptions
): Promise<Result<UninstallConstraintsSuccess, string>> {
  const { packageName, configPath, lockfilePath } = options;

  // 1. Read lockfile
  const lockfileResult = await readLockfile(lockfilePath);
  if (!lockfileResult.ok) {
    return { ok: false, error: lockfileResult.error };
  }
  if (lockfileResult.value === null) {
    return { ok: false, error: 'No lockfile found. No constraint packages are installed.' };
  }
  const lockfile = lockfileResult.value;

  // 2. Find the package
  const entry = lockfile.packages[packageName];
  if (!entry) {
    return {
      ok: false,
      error: `Package '${packageName}' is not installed.`,
    };
  }

  // 3. Read local config
  let localConfig: Record<string, unknown>;
  try {
    const raw = await fs.readFile(configPath, 'utf-8');
    localConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch (err: unknown) {
    return {
      ok: false,
      error: `Failed to read local config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Remove contributions from config
  const contributions = (entry.contributions ?? {}) as Contributions;
  const sectionsRemoved = Object.keys(contributions);
  const updatedConfig = removeContributions(localConfig, contributions);

  // 5. Remove package from lockfile
  const { lockfile: updatedLockfile } = removeProvenance(lockfile, packageName);

  // 6. Write updated config
  const writeResult = await writeConfig(configPath, updatedConfig);
  if (!writeResult.ok) {
    return {
      ok: false,
      error: `Failed to write config: ${writeResult.error instanceof Error ? writeResult.error.message : String(writeResult.error)}`,
    };
  }

  // 7. Write updated lockfile
  const lockfileWriteResult = await writeLockfile(lockfilePath, updatedLockfile);
  if (!lockfileWriteResult.ok) {
    return {
      ok: false,
      error: `Config was written but lockfile write failed: ${lockfileWriteResult.error.message}. Lockfile may be out of sync.`,
    };
  }

  return {
    ok: true,
    value: {
      removed: true,
      packageName,
      version: entry.version,
      sectionsRemoved,
    },
  };
}

// --- Commander command ---

export function createUninstallConstraintsCommand(): Command {
  const cmd = new Command('uninstall-constraints');
  cmd
    .description('Remove a previously installed constraints package')
    .argument('<name>', 'Name of the constraint package to uninstall')
    .option('-c, --config <path>', 'Path to harness.config.json')
    .action(async (name: string, opts: { config?: string }) => {
      // Resolve config path
      let configPath: string;
      if (opts.config) {
        configPath = path.resolve(opts.config);
      } else {
        const found = findConfigFile();
        if (!found.ok) {
          logger.error(found.error.message);
          process.exit(1);
        }
        configPath = found.value;
      }

      // Derive lockfile path
      const projectRoot = path.dirname(configPath);
      const lockfilePath = path.join(projectRoot, '.harness', 'constraints.lock.json');

      const result = await runUninstallConstraints({
        packageName: name,
        configPath,
        lockfilePath,
      });

      if (!result.ok) {
        logger.error(result.error);
        process.exit(1);
      }

      const val = result.value;
      if (val.sectionsRemoved.length === 0) {
        logger.success(
          `Removed ${val.packageName}@${val.version} (no contributed rules to remove)`
        );
      } else {
        logger.success(
          `Removed ${val.packageName}@${val.version} (${val.sectionsRemoved.length} section(s): ${val.sectionsRemoved.join(', ')})`
        );
      }
    });
  return cmd;
}
