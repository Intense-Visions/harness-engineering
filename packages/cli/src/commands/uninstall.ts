import * as path from 'path';
import { Command } from 'commander';
import { resolvePackageName, extractSkillName } from '../registry/npm-client';
import { readLockfile, writeLockfile, removeLockfileEntry } from '../registry/lockfile';
import { findDependentsOf } from '../registry/resolver';
import { removeSkillContent } from '../registry/tarball';
import { resolveGlobalSkillsDir } from '../utils/paths';
import { logger } from '../output/logger';

export interface UninstallOptions {
  force?: boolean;
}

export interface UninstallResult {
  removed: boolean;
  name: string;
  version: string;
  warnings?: string[];
}

export async function runUninstall(
  skillName: string,
  options: UninstallOptions
): Promise<UninstallResult> {
  const packageName = resolvePackageName(skillName);
  const shortName = extractSkillName(packageName);

  // Resolve paths
  const globalDir = resolveGlobalSkillsDir();
  const skillsDir = path.dirname(globalDir);
  const communityBase = path.join(skillsDir, 'community');
  const lockfilePath = path.join(communityBase, 'skills-lock.json');

  // Read lockfile
  const lockfile = readLockfile(lockfilePath);
  const entry = lockfile.skills[packageName];

  if (!entry) {
    throw new Error(`Skill '${shortName}' is not installed.`);
  }

  // Check for dependents
  const dependents = findDependentsOf(lockfile, packageName);
  const warnings: string[] = [];

  if (dependents.length > 0) {
    if (!options.force) {
      throw new Error(
        `Cannot uninstall '${shortName}' because it is required by: ${dependents.join(', ')}. ` +
          `Use --force to remove anyway.`
      );
    }
    warnings.push(`Forced removal despite dependents: ${dependents.join(', ')}`);
  }

  // Remove skill content from all platforms
  removeSkillContent(communityBase, shortName, entry.platforms);

  // Update lockfile
  const updatedLockfile = removeLockfileEntry(lockfile, packageName);
  writeLockfile(lockfilePath, updatedLockfile);

  const result: UninstallResult = {
    removed: true,
    name: packageName,
    version: entry.version,
  };

  if (warnings.length > 0) {
    result.warnings = warnings;
  }

  return result;
}

export function createUninstallCommand(): Command {
  const cmd = new Command('uninstall');
  cmd
    .description('Uninstall a community skill')
    .argument('<skill>', 'Skill name or @harness-skills/scoped package name')
    .option('--force', 'Remove even if other skills depend on this one')
    .action(async (skill: string, opts: UninstallOptions) => {
      try {
        const result = await runUninstall(skill, opts);
        if (result.warnings) {
          for (const warning of result.warnings) {
            logger.warn(warning);
          }
        }
        logger.success(`Uninstalled ${result.name}@${result.version}`);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
  return cmd;
}
