import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
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
import { resolveGlobalSkillsDir, resolveGlobalCommunityBaseDir } from '../utils/paths';
import { logger } from '../output/logger';
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph';

export interface InstallOptions {
  version?: string;
  force?: boolean;
  from?: string;
  registry?: string;
  global?: boolean;
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

/**
 * Resolve where community skills should be placed.
 * --global installs to ~/.harness/skills/community/ (available to all projects).
 * Otherwise installs to the project-level agents/skills/community/.
 */
function resolveCommunityBase(global: boolean): { communityBase: string; lockfilePath: string } {
  if (global) {
    const communityBase = resolveGlobalCommunityBaseDir();
    return { communityBase, lockfilePath: path.join(communityBase, 'skills-lock.json') };
  }
  const globalDir = resolveGlobalSkillsDir();
  const skillsDir = path.dirname(globalDir);
  const communityBase = path.join(skillsDir, 'community');
  return { communityBase, lockfilePath: path.join(communityBase, 'skills-lock.json') };
}

/**
 * Detect if a --from value is a GitHub reference.
 * Supports: github:owner/repo, github:owner/repo#branch, https://github.com/owner/repo
 */
function parseGitHubRef(from: string): { owner: string; repo: string; ref: string } | null {
  // github:owner/repo or github:owner/repo#branch
  const ghPrefix = from.match(/^github:([^/]+)\/([^#]+?)(?:#(.+))?$/);
  if (ghPrefix && ghPrefix[1] && ghPrefix[2]) {
    return { owner: ghPrefix[1], repo: ghPrefix[2], ref: ghPrefix[3] ?? 'HEAD' };
  }
  // https://github.com/owner/repo or https://github.com/owner/repo/tree/branch
  const urlMatch = from.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?$/
  );
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2], ref: urlMatch[3] ?? 'HEAD' };
  }
  return null;
}

/**
 * Clone a GitHub repo to a temp directory (shallow clone).
 * Returns the path to the cloned directory.
 */
function cloneGitHubRepo(owner: string, repo: string, ref: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-gh-install-'));
  const url = `https://github.com/${owner}/${repo}.git`;

  try {
    const cloneArgs = ['clone', '--depth', '1'];
    if (ref !== 'HEAD') {
      cloneArgs.push('--branch', ref);
    }
    cloneArgs.push(url, tmpDir);
    execFileSync('git', cloneArgs, { timeout: 60_000, stdio: 'pipe' });
  } catch (err) {
    cleanupTempDir(tmpDir);
    throw new Error(`Failed to clone ${url}: ${err instanceof Error ? err.message : String(err)}`, {
      cause: err,
    });
  }
  return tmpDir;
}

/**
 * Discover all skill directories under a path.
 * Walks up to 3 levels deep looking for directories containing skill.yaml.
 */
function discoverSkillDirs(rootDir: string): string[] {
  const skillDirs: string[] = [];

  function scan(dir: string, depth: number): void {
    if (depth > 3) return;
    if (!fs.existsSync(dir)) return;

    // Check if this directory itself is a skill
    if (fs.existsSync(path.join(dir, 'skill.yaml'))) {
      skillDirs.push(dir);
      return; // Don't recurse into skill directories
    }

    // Recurse into subdirectories
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || DEFAULT_SKIP_DIRS.has(entry.name)) continue;
      scan(path.join(dir, entry.name), depth + 1);
    }
  }

  scan(rootDir, 0);
  return skillDirs;
}

/** Resolve a local --from path to a pkg directory, returning the temp dir if one was created. */
function resolveLocalPkgDir(fromPath: string): { pkgDir: string; extractDir: string | null } {
  const resolvedPath = path.resolve(fromPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`--from path does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    return { pkgDir: resolvedPath, extractDir: null };
  }
  if (resolvedPath.endsWith('.tgz') || resolvedPath.endsWith('.tar.gz')) {
    const tarballBuffer = fs.readFileSync(resolvedPath);
    const extractDir = extractTarball(tarballBuffer);
    return { pkgDir: path.join(extractDir, 'package'), extractDir };
  }
  throw new Error(`--from path must be a directory or .tgz file. Got: ${resolvedPath}`);
}

/** Install a single validated skill directory into the community base. */
function installSkillDir(
  pkgDir: string,
  resolvedPath: string,
  options: InstallOptions
): InstallResult {
  const skillYamlPath = path.join(pkgDir, 'skill.yaml');
  if (!fs.existsSync(skillYamlPath)) {
    throw new Error(`No skill.yaml found at ${skillYamlPath}`);
  }
  const skillYaml = validateSkillYaml(yamlParse(fs.readFileSync(skillYamlPath, 'utf-8')));
  const shortName = skillYaml.name;

  const { communityBase, lockfilePath } = resolveCommunityBase(options.global ?? false);

  if (!options.global) {
    const bundledNames = getBundledSkillNames(resolveGlobalSkillsDir());
    if (bundledNames.has(shortName)) {
      throw new Error(
        `'${shortName}' is a bundled skill and cannot be overridden by community installs.`
      );
    }
  }

  placeSkillContent(pkgDir, communityBase, shortName, skillYaml.platforms);

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
  writeLockfile(lockfilePath, updateLockfileEntry(lockfile, packageName, entry));

  return { installed: true, name: packageName, version: skillYaml.version };
}

async function runLocalInstall(fromPath: string, options: InstallOptions): Promise<InstallResult> {
  const { pkgDir, extractDir } = resolveLocalPkgDir(fromPath);
  try {
    return installSkillDir(pkgDir, path.resolve(fromPath), options);
  } finally {
    if (extractDir) cleanupTempDir(extractDir);
  }
}

/**
 * Install all skills discovered under a directory (bulk install).
 * Discovers skill.yaml files recursively and installs each one.
 */
export async function runBulkInstall(
  rootDir: string,
  options: InstallOptions
): Promise<InstallResult[]> {
  const skillDirs = discoverSkillDirs(rootDir);
  if (skillDirs.length === 0) {
    throw new Error(
      `No skills found under ${rootDir}. Expected directories containing skill.yaml.`
    );
  }

  const results: InstallResult[] = [];
  for (const skillDir of skillDirs) {
    const result = await runLocalInstall(skillDir, options);
    results.push(result);
  }
  return results;
}

/**
 * Install from a GitHub repository.
 * Clones the repo to a temp directory, discovers skills, and installs them.
 */
async function runGitHubInstall(from: string, options: InstallOptions): Promise<InstallResult[]> {
  const ghRef = parseGitHubRef(from);
  if (!ghRef) throw new Error(`Invalid GitHub reference: ${from}`);

  const tmpDir = cloneGitHubRepo(ghRef.owner, ghRef.repo, ghRef.ref);
  try {
    return await runBulkInstall(tmpDir, options);
  } finally {
    cleanupTempDir(tmpDir);
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

  // Local or GitHub install path
  if (options.from) {
    // GitHub references are handled as bulk installs
    if (parseGitHubRef(options.from)) {
      const results = await runGitHubInstall(options.from, options);
      // Return aggregate result
      const installed = results.filter((r) => r.installed);
      return {
        installed: installed.length > 0,
        name: installed.map((r) => r.name).join(', '),
        version: installed.map((r) => r.version).join(', '),
      };
    }

    // Check if --from points to a directory containing multiple skills (no skill.yaml at root)
    const resolvedFrom = path.resolve(options.from);
    if (
      fs.existsSync(resolvedFrom) &&
      fs.statSync(resolvedFrom).isDirectory() &&
      !fs.existsSync(path.join(resolvedFrom, 'skill.yaml'))
    ) {
      const results = await runBulkInstall(resolvedFrom, options);
      const installed = results.filter((r) => r.installed);
      return {
        installed: installed.length > 0,
        name: installed.map((r) => r.name).join(', '),
        version: installed.map((r) => r.version).join(', '),
      };
    }

    return runLocalInstall(options.from, options);
  }

  const packageName = resolvePackageName(skillName);
  const shortName = extractSkillName(packageName);

  // Resolve paths
  const { communityBase, lockfilePath } = resolveCommunityBase(options.global ?? false);

  // Check bundled skill collision (only for project-level installs)
  if (!options.global) {
    const bundledNames = getBundledSkillNames(resolveGlobalSkillsDir());
    if (bundledNames.has(shortName)) {
      throw new Error(
        `'${shortName}' is a bundled skill and cannot be overridden by community installs.`
      );
    }
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
      global: options.global ?? false,
      _dependencyOf: packageName,
      ...(options.registry !== undefined ? { registry: options.registry } : {}),
    });
  }

  return result;
}

export function createInstallCommand(): Command {
  const cmd = new Command('install');
  cmd
    .description('Install skills from npm registry, local directory, or GitHub repository')
    .argument('<skill>', 'Skill name, @harness-skills/scoped package, or "." for bulk install')
    .option('--version <range>', 'Semver range or exact version to install')
    .option('--force', 'Force reinstall even if same version is already installed')
    .option(
      '--from <source>',
      'Install from local path, directory, or GitHub (github:owner/repo, https://github.com/owner/repo)'
    )
    .option('--global', 'Install globally (~/.harness/skills/community/) for all projects', false)
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
        } else if (result.installed) {
          logger.success(`Installed ${result.name}@${result.version}`);
        }

        // Prompt to generate slash commands after successful install/upgrade
        if (result.installed || result.upgraded) {
          const globalFlag = opts.global ? ' --global --include-global' : '';
          logger.info(
            `Run \`harness generate-slash-commands${globalFlag}\` to register slash commands.`
          );
        }
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
  return cmd;
}
