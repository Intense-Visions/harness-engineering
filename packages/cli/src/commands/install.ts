import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { parse as yamlParse } from 'yaml';
import {
  resolvePackageName,
  extractSkillName,
  fetchPackageMetadata,
  downloadTarball,
} from '../registry/npm-client';
import { extractTarball, placeSkillContent, cleanupTempDir } from '../registry/tarball';
import { resolveVersion } from '../registry/resolver';
import {
  readLockfile,
  writeLockfile,
  updateLockfileEntry,
  type LockfileEntry,
} from '../registry/lockfile';
import { getBundledSkillNames } from '../registry/bundled-skills';
import { resolveGlobalSkillsDir } from '../utils/paths';
import { logger } from '../output/logger';

export interface InstallOptions {
  version?: string;
  force?: boolean;
}

export interface InstallResult {
  installed: boolean;
  skipped?: boolean;
  upgraded?: boolean;
  name: string;
  version: string;
  previousVersion?: string;
  warnings?: string[];
}

interface SkillYaml {
  name: string;
  version: string;
  platforms: string[];
  depends_on?: string[];
}

function validateSkillYaml(parsed: unknown): SkillYaml {
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('name' in parsed) ||
    !('version' in parsed) ||
    !('platforms' in parsed)
  ) {
    throw new Error('contains invalid skill.yaml');
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj['name'] !== 'string' ||
    typeof obj['version'] !== 'string' ||
    !Array.isArray(obj['platforms'])
  ) {
    throw new Error('contains invalid skill.yaml');
  }
  return {
    name: obj['name'] as string,
    version: obj['version'] as string,
    platforms: obj['platforms'] as string[],
    depends_on: Array.isArray(obj['depends_on']) ? (obj['depends_on'] as string[]) : [],
  };
}

export async function runInstall(
  skillName: string,
  options: InstallOptions
): Promise<InstallResult> {
  const packageName = resolvePackageName(skillName);
  const shortName = extractSkillName(packageName);

  // Resolve paths
  const globalDir = resolveGlobalSkillsDir();
  const skillsDir = path.dirname(globalDir);
  const communityBase = path.join(skillsDir, 'community');
  const lockfilePath = path.join(communityBase, 'skills-lock.json');

  // Check bundled skill collision
  const bundledNames = getBundledSkillNames(globalDir);
  if (bundledNames.has(shortName)) {
    throw new Error(
      `'${shortName}' is a bundled skill and cannot be overridden by community installs.`
    );
  }

  // Fetch metadata and resolve version
  const metadata = await fetchPackageMetadata(packageName);
  const versionInfo = resolveVersion(metadata, options.version);
  const resolvedVersion = versionInfo.version;

  // Check if already installed at same version
  const lockfile = readLockfile(lockfilePath);
  const existingEntry = lockfile.skills[packageName];
  const previousVersion = existingEntry?.version;

  if (existingEntry && existingEntry.version === resolvedVersion && !options.force) {
    return {
      installed: false,
      skipped: true,
      name: packageName,
      version: resolvedVersion,
    };
  }

  // Download and extract tarball
  const tarballBuffer = await downloadTarball(versionInfo.dist.tarball);
  const extractDir = extractTarball(tarballBuffer);

  let skillYaml: SkillYaml;
  try {
    // Read skill.yaml from extracted package/
    const extractedPkgDir = path.join(extractDir, 'package');
    const skillYamlPath = path.join(extractedPkgDir, 'skill.yaml');

    if (!fs.existsSync(skillYamlPath)) {
      throw new Error(`contains invalid skill.yaml: file not found in package`);
    }

    const rawYaml = fs.readFileSync(skillYamlPath, 'utf-8');
    const parsed = yamlParse(rawYaml);
    skillYaml = validateSkillYaml(parsed);

    // Place skill content for each platform
    placeSkillContent(extractedPkgDir, communityBase, shortName, skillYaml.platforms);
  } catch (err) {
    cleanupTempDir(extractDir);
    throw err;
  }

  cleanupTempDir(extractDir);

  // Update lockfile
  const entry: LockfileEntry = {
    version: resolvedVersion,
    resolved: versionInfo.dist.tarball,
    integrity: versionInfo.dist.integrity,
    platforms: skillYaml.platforms,
    installedAt: new Date().toISOString(),
    dependencyOf: null,
  };

  let updatedLockfile = updateLockfileEntry(lockfile, packageName, entry);
  writeLockfile(lockfilePath, updatedLockfile);

  const result: InstallResult = {
    installed: true,
    name: packageName,
    version: resolvedVersion,
  };

  if (previousVersion && previousVersion !== resolvedVersion) {
    result.upgraded = true;
    result.previousVersion = previousVersion;
  }

  // Auto-install dependencies
  const deps = skillYaml.depends_on ?? [];
  for (const dep of deps) {
    logger.info(`Installing dependency: ${dep}`);
    await runInstall(dep, {});
  }

  return result;
}

export function createInstallCommand(): Command {
  const cmd = new Command('install');
  cmd
    .description('Install a community skill from the @harness-skills registry')
    .argument('<skill>', 'Skill name or @harness-skills/scoped package name')
    .option('--version <range>', 'Semver range or exact version to install')
    .option('--force', 'Force reinstall even if same version is already installed')
    .action(async (skill: string, opts: InstallOptions) => {
      try {
        const result = await runInstall(skill, opts);
        if (result.skipped) {
          logger.info(
            `${result.name}@${result.version} is already installed. Use --force to reinstall.`
          );
        } else if (result.upgraded) {
          logger.success(
            `Upgraded ${result.name} from ${result.previousVersion} to ${result.version}`
          );
        } else {
          logger.success(`Installed ${result.name}@${result.version}`);
        }
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
  return cmd;
}
