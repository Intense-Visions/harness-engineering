import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { parse as yamlParse } from 'yaml';
import { SkillMetadataSchema } from '../skill/schema';
import {
  resolvePackageName,
  extractSkillName,
  fetchPackageMetadata,
  downloadTarball,
  readNpmrcToken,
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
  from?: string;
  registry?: string;
  /** Internal: tracks which package triggered this install (for transitive deps) */
  _dependencyOf?: string | null;
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
  const result = SkillMetadataSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`contains invalid skill.yaml: ${issues}`);
  }
  return {
    name: result.data.name,
    version: result.data.version,
    platforms: result.data.platforms,
    depends_on: result.data.depends_on ?? [],
  };
}

async function runLocalInstall(fromPath: string, options: InstallOptions): Promise<InstallResult> {
  const resolvedPath = path.resolve(fromPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`--from path does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);

  let extractDir: string | null = null;
  let pkgDir: string;

  if (stat.isDirectory()) {
    pkgDir = resolvedPath;
  } else if (resolvedPath.endsWith('.tgz') || resolvedPath.endsWith('.tar.gz')) {
    const tarballBuffer = fs.readFileSync(resolvedPath);
    extractDir = extractTarball(tarballBuffer);
    pkgDir = path.join(extractDir, 'package');
  } else {
    throw new Error(`--from path must be a directory or .tgz file. Got: ${resolvedPath}`);
  }

  try {
    // Validate skill.yaml
    const skillYamlPath = path.join(pkgDir, 'skill.yaml');
    if (!fs.existsSync(skillYamlPath)) {
      throw new Error(`No skill.yaml found at ${skillYamlPath}`);
    }
    const rawYaml = fs.readFileSync(skillYamlPath, 'utf-8');
    const parsed = yamlParse(rawYaml);
    const skillYaml = validateSkillYaml(parsed);
    const shortName = skillYaml.name;

    // Resolve paths
    const globalDir = resolveGlobalSkillsDir();
    const skillsDir = path.dirname(globalDir);
    const communityBase = path.join(skillsDir, 'community');
    const lockfilePath = path.join(communityBase, 'skills-lock.json');

    // Check bundled collision
    const bundledNames = getBundledSkillNames(globalDir);
    if (bundledNames.has(shortName)) {
      throw new Error(
        `'${shortName}' is a bundled skill and cannot be overridden by community installs.`
      );
    }

    // Place content
    placeSkillContent(pkgDir, communityBase, shortName, skillYaml.platforms);

    // Update lockfile
    const packageName = `@harness-skills/${shortName}`;
    const lockfile = readLockfile(lockfilePath);
    const entry: LockfileEntry = {
      version: skillYaml.version,
      resolved: `local:${resolvedPath}`,
      integrity: '',
      platforms: skillYaml.platforms,
      installedAt: new Date().toISOString(),
      dependencyOf: options._dependencyOf ?? null,
    };
    const updatedLockfile = updateLockfileEntry(lockfile, packageName, entry);
    writeLockfile(lockfilePath, updatedLockfile);

    return {
      installed: true,
      name: packageName,
      version: skillYaml.version,
    };
  } finally {
    if (extractDir) {
      cleanupTempDir(extractDir);
    }
  }
}

export async function runInstall(
  skillName: string,
  options: InstallOptions
): Promise<InstallResult> {
  // Validate mutually exclusive options
  if (options.from && options.registry) {
    throw new Error('--from and --registry cannot be used together');
  }

  // Local install path
  if (options.from) {
    return runLocalInstall(options.from, options);
  }

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
  const metadata = await fetchPackageMetadata(packageName, options.registry);
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
  const authToken = options.registry ? (readNpmrcToken(options.registry) ?? undefined) : undefined;
  const tarballBuffer = await downloadTarball(versionInfo.dist.tarball, authToken);
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
    dependencyOf: options._dependencyOf ?? null,
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
    logger.info(`Installing dependency: ${dep} (required by ${shortName})`);
    await runInstall(dep, {
      _dependencyOf: packageName,
      ...(options.registry !== undefined ? { registry: options.registry } : {}),
    });
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
    .option('--from <path>', 'Install from a local directory or .tgz file')
    .option('--registry <url>', 'Use a custom npm registry URL')
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
