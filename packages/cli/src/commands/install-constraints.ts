import * as fs from 'fs/promises';
import * as path from 'path';
import { Command } from 'commander';
import semver from 'semver';
import type { Result } from '@harness-engineering/types';
import {
  BundleSchema,
  deepMergeConstraints,
  readLockfile,
  writeLockfile,
  addProvenance,
  writeConfig,
  removeContributions,
} from '@harness-engineering/core';
import type { Bundle, Lockfile, LockfilePackage, Contributions } from '@harness-engineering/core';
import type { ConflictReport } from '@harness-engineering/core';
import { findConfigFile } from '../config/loader';
import { logger } from '../output/logger';
import { CLI_VERSION } from '../version';

// --- Types ---

export interface InstallConstraintsOptions {
  source: string;
  configPath: string;
  lockfilePath: string;
  forceLocal?: boolean;
  forcePackage?: boolean;
  dryRun?: boolean;
}

export interface InstallConstraintsSuccess {
  installed: boolean;
  packageName: string;
  version: string;
  contributionsCount: number;
  conflicts: ConflictReport[];
  alreadyInstalled?: boolean;
  dryRun?: boolean;
}

// --- Core orchestration ---

export async function runInstallConstraints(
  options: InstallConstraintsOptions
): Promise<Result<InstallConstraintsSuccess, string>> {
  const { source, configPath, lockfilePath } = options;

  // 1. Read and parse bundle file
  let rawBundle: string;
  try {
    rawBundle = await fs.readFile(source, 'utf-8');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return { ok: false, error: `Bundle file not found: ${source}` };
    }
    return {
      ok: false,
      error: `Failed to read bundle: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBundle);
  } catch {
    return { ok: false, error: `Bundle file contains invalid JSON: ${source}` };
  }

  // 2. Validate against BundleSchema
  const bundleResult = BundleSchema.safeParse(parsedJson);
  if (!bundleResult.success) {
    const issues = bundleResult.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, error: `Bundle schema validation failed: ${issues}` };
  }
  const bundle: Bundle = bundleResult.data;

  // 3. Check minHarnessVersion
  if (bundle.minHarnessVersion) {
    const installed = semver.valid(semver.coerce(CLI_VERSION));
    const required = semver.valid(semver.coerce(bundle.minHarnessVersion));
    if (installed && required && semver.lt(installed, required)) {
      return {
        ok: false,
        error: `Bundle requires harness version >= ${bundle.minHarnessVersion}, but installed version is ${CLI_VERSION}. Please upgrade.`,
      };
    }
  }

  // 4. Check for empty constraints
  const constraintKeys = Object.keys(bundle.constraints).filter(
    (k) => bundle.constraints[k as keyof typeof bundle.constraints] !== undefined
  );
  if (constraintKeys.length === 0) {
    return {
      ok: false,
      error: 'Bundle contains no constraints. Nothing to install.',
    };
  }

  // 5. Read local config
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

  // 6. Read existing lockfile
  const lockfileResult = await readLockfile(lockfilePath);
  if (!lockfileResult.ok) {
    return { ok: false, error: lockfileResult.error };
  }
  const existingLockfile: Lockfile = lockfileResult.value ?? {
    version: 1,
    packages: {},
  };

  // 7. Check idempotency or upgrade
  const existingEntry = existingLockfile.packages[bundle.name];
  if (existingEntry && existingEntry.version === bundle.version) {
    return {
      ok: true,
      value: {
        installed: false,
        packageName: bundle.name,
        version: bundle.version,
        contributionsCount: 0,
        conflicts: [],
        alreadyInstalled: true,
      },
    };
  }

  // 7b. Upgrade: remove old contributions before merging new ones
  if (existingEntry) {
    const oldContributions = (existingEntry.contributions ?? {}) as Record<string, unknown>;
    localConfig = removeContributions(localConfig, oldContributions);
  }

  // 8. Deep-merge constraints
  const mergeResult = deepMergeConstraints(localConfig, bundle.constraints);

  // 9. Handle conflicts
  if (mergeResult.conflicts.length > 0) {
    if (options.forceLocal) {
      // Keep merged config as-is (deepMergeConstraints already keeps local values for conflicts)
      // No additional action needed -- conflicts are left as local values
    } else if (options.forcePackage) {
      // Apply package values for each conflict
      for (const conflict of mergeResult.conflicts) {
        applyPackageValue(mergeResult.config, conflict);
        // Track as contribution
        addConflictContribution(mergeResult.contributions, conflict);
      }
    } else if (!options.dryRun) {
      // No resolution strategy and not dry-run -- cannot proceed
      return {
        ok: false,
        error: formatConflictsError(mergeResult.conflicts),
      };
    }
  }

  // 10. Dry-run: report without writing
  if (options.dryRun) {
    return {
      ok: true,
      value: {
        installed: false,
        packageName: bundle.name,
        version: bundle.version,
        contributionsCount: Object.keys(mergeResult.contributions).length,
        conflicts: mergeResult.conflicts,
        dryRun: true,
      },
    };
  }

  // 11. Write merged config
  const writeResult = await writeConfig(configPath, mergeResult.config);
  if (!writeResult.ok) {
    return {
      ok: false,
      error: `Failed to write config: ${writeResult.error instanceof Error ? writeResult.error.message : String(writeResult.error)}`,
    };
  }

  // 12. Update lockfile
  const lockfileEntry: LockfilePackage = {
    version: bundle.version,
    source,
    installedAt: new Date().toISOString(),
    contributions: mergeResult.contributions,
  };
  const updatedLockfile = addProvenance(existingLockfile, bundle.name, lockfileEntry);

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
      installed: true,
      packageName: bundle.name,
      version: bundle.version,
      contributionsCount: Object.keys(mergeResult.contributions).length,
      conflicts: mergeResult.conflicts,
    },
  };
}

// --- Conflict helpers ---

type SectionApplier = (config: Record<string, unknown>, key: string, value: unknown) => void;

const sectionAppliers: Record<string, SectionApplier> = {
  layers(config, key, value) {
    const layers = config.layers as Array<{
      name: string;
      pattern: string;
      allowedDependencies: string[];
    }>;
    const idx = layers.findIndex((l) => l.name === key);
    if (idx >= 0) layers[idx] = value as (typeof layers)[number];
  },
  forbiddenImports(config, key, value) {
    const rules = config.forbiddenImports as Array<{
      from: string;
      disallow: string[];
      message?: string;
    }>;
    const idx = rules.findIndex((r) => r.from === key);
    if (idx >= 0) rules[idx] = value as (typeof rules)[number];
  },
  'architecture.thresholds'(config, key, value) {
    const arch = config.architecture as { thresholds: Record<string, unknown> } | undefined;
    if (arch?.thresholds) arch.thresholds[key] = value;
  },
  'architecture.modules'(config, key, value) {
    const arch = config.architecture as
      | { modules: Record<string, Record<string, unknown>> }
      | undefined;
    const [modulePath, category] = key.split(':');
    if (arch?.modules && modulePath && category && arch.modules[modulePath]) {
      arch.modules[modulePath][category] = value;
    }
  },
  'security.rules'(config, key, value) {
    const security = config.security as { rules: Record<string, string> } | undefined;
    if (security?.rules) security.rules[key] = value as string;
  },
};

function applyPackageValue(config: Record<string, unknown>, conflict: ConflictReport): void {
  const applier = sectionAppliers[conflict.section];
  if (applier) applier(config, conflict.key, conflict.packageValue);
}

function addConflictContribution(contributions: Contributions, conflict: ConflictReport): void {
  const section = conflict.section;
  const existing = (contributions[section] as string[]) ?? [];
  existing.push(conflict.key);
  contributions[section] = existing;
}

function formatConflictsError(conflicts: ConflictReport[]): string {
  const lines = [
    `${conflicts.length} conflict(s) detected. Resolve with --force-local or --force-package:`,
    '',
  ];
  for (const c of conflicts) {
    lines.push(`  [${c.section}] ${c.key}: ${c.description}`);
    lines.push(`    Local:   ${JSON.stringify(c.localValue)}`);
    lines.push(`    Package: ${JSON.stringify(c.packageValue)}`);
    lines.push('');
  }
  return lines.join('\n');
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

// --- Commander command ---

interface InstallConstraintsOpts {
  forceLocal?: boolean;
  forcePackage?: boolean;
  dryRun?: boolean;
  config?: string;
}

function resolveConfigPath(opts: InstallConstraintsOpts): string {
  if (opts.config) return path.resolve(opts.config);
  const found = findConfigFile();
  if (!found.ok) {
    logger.error(found.error.message);
    process.exit(1);
  }
  return found.value;
}

function logInstallResult(
  val: {
    dryRun?: boolean;
    alreadyInstalled?: boolean;
    packageName: string;
    version: string;
    contributionsCount: number;
    conflicts: ConflictReport[];
  },
  opts: InstallConstraintsOpts
): void {
  if (val.dryRun) {
    logger.info(`[dry-run] Would install ${val.packageName}@${val.version}`);
    logger.info(`[dry-run] ${val.contributionsCount} section(s) would be added`);
    if (val.conflicts.length > 0) {
      logger.warn(`[dry-run] ${val.conflicts.length} conflict(s) detected`);
      for (const c of val.conflicts) {
        logger.warn(`  [${c.section}] ${c.key}: ${c.description}`);
      }
    }
    return;
  }

  if (val.alreadyInstalled) {
    logger.info(`${val.packageName}@${val.version} is already installed. No changes made.`);
    return;
  }

  logger.success(
    `Installed ${val.packageName}@${val.version} (${val.contributionsCount} section(s) merged)`
  );

  if (val.conflicts.length > 0) {
    logger.warn(
      `${val.conflicts.length} conflict(s) resolved with ${opts.forceLocal ? '--force-local' : '--force-package'}`
    );
  }
}

async function handleInstallConstraints(
  source: string,
  opts: InstallConstraintsOpts
): Promise<void> {
  const configPath = resolveConfigPath(opts);
  const projectRoot = path.dirname(configPath);
  const lockfilePath = path.join(projectRoot, '.harness', 'constraints.lock.json');
  const resolvedSource = path.resolve(source);

  if (opts.forceLocal && opts.forcePackage) {
    logger.error('Cannot use both --force-local and --force-package.');
    process.exit(1);
  }

  const result = await runInstallConstraints({
    source: resolvedSource,
    configPath,
    lockfilePath,
    ...(opts.forceLocal && { forceLocal: true }),
    ...(opts.forcePackage && { forcePackage: true }),
    ...(opts.dryRun && { dryRun: true }),
  });

  if (!result.ok) {
    logger.error(result.error);
    process.exit(1);
  }

  logInstallResult(result.value, opts);
}

export function createInstallConstraintsCommand(): Command {
  const cmd = new Command('install-constraints');
  cmd
    .description('Install a constraints bundle into the local harness config')
    .argument('<source>', 'Path to a .harness-constraints.json bundle file')
    .option('--force-local', 'Resolve all conflicts by keeping local values')
    .option('--force-package', 'Resolve all conflicts by using package values')
    .option('--dry-run', 'Show what would change without writing files')
    .option('-c, --config <path>', 'Path to harness.config.json')
    .action(handleInstallConstraints);
  return cmd;
}
