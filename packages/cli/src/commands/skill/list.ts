import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveProjectSkillsDir, resolveGlobalSkillsDir } from '../../utils/paths';
import { readLockfile } from '../../registry/lockfile';

export interface SkillListEntry {
  name: string;
  description: string;
  type: string;
  source: 'local' | 'community' | 'bundled';
  version?: string;
}

interface CollectOptions {
  filter: 'all' | 'installed' | 'local';
}

function scanDirectory(
  dirPath: string,
  source: 'local' | 'community' | 'bundled'
): SkillListEntry[] {
  if (!fs.existsSync(dirPath)) return [];

  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const skills: SkillListEntry[] = [];
  for (const name of entries) {
    const yamlPath = path.join(dirPath, name, 'skill.yaml');
    if (!fs.existsSync(yamlPath)) continue;
    try {
      const raw = fs.readFileSync(yamlPath, 'utf-8');
      const parsed = parse(raw);
      const result = SkillMetadataSchema.safeParse(parsed);
      if (result.success) {
        skills.push({
          name: result.data.name,
          description: result.data.description,
          type: result.data.type,
          source,
        });
      }
    } catch {
      // skip invalid entries
    }
  }
  return skills;
}

function collectCommunitySkills(seen: Set<string>, allSkills: SkillListEntry[]): SkillListEntry[] {
  const globalDir = resolveGlobalSkillsDir();
  const skillsDir = path.dirname(globalDir);
  const communityBase = path.join(skillsDir, 'community');
  const communityPlatformDir = path.join(communityBase, 'claude-code');
  const lockfilePath = path.join(communityBase, 'skills-lock.json');
  const lockfile = readLockfile(lockfilePath);

  const communitySkills = scanDirectory(communityPlatformDir, 'community');
  for (const skill of communitySkills) {
    const lockEntry = lockfile.skills[`@harness-skills/${skill.name}`];
    if (lockEntry) skill.version = lockEntry.version;
  }

  // Also include lockfile-only entries (in case files were removed but lockfile remains)
  for (const [pkgName, entry] of Object.entries(lockfile.skills)) {
    const shortName = pkgName.replace('@harness-skills/', '');
    if (!seen.has(shortName)) {
      seen.add(shortName);
      allSkills.push({
        name: shortName,
        description: '',
        type: '',
        source: 'community',
        version: entry.version,
      });
    }
  }

  return communitySkills;
}

function addUnique(
  entries: SkillListEntry[],
  seen: Set<string>,
  allSkills: SkillListEntry[]
): void {
  for (const entry of entries) {
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      allSkills.push(entry);
    }
  }
}

function collectLocalSkills(seen: Set<string>, allSkills: SkillListEntry[]): void {
  const projectDir = resolveProjectSkillsDir();
  if (projectDir) addUnique(scanDirectory(projectDir, 'local'), seen, allSkills);
}

function collectBundledSkills(seen: Set<string>, allSkills: SkillListEntry[]): void {
  const globalDir = resolveGlobalSkillsDir();
  addUnique(scanDirectory(globalDir, 'bundled'), seen, allSkills);
}

/**
 * Collect skills from all sources with deduplication.
 * Priority: local > community > bundled (first found wins).
 */
export function collectSkills(opts: CollectOptions): SkillListEntry[] {
  const seen = new Set<string>();
  const allSkills: SkillListEntry[] = [];

  if (opts.filter === 'all' || opts.filter === 'local') collectLocalSkills(seen, allSkills);
  if (opts.filter === 'all' || opts.filter === 'installed') {
    addUnique(collectCommunitySkills(seen, allSkills), seen, allSkills);
  }
  if (opts.filter === 'all') collectBundledSkills(seen, allSkills);

  if (opts.filter === 'installed') return allSkills.filter((s) => s.source === 'community');
  if (opts.filter === 'local') return allSkills.filter((s) => s.source === 'local');
  return allSkills;
}

function resolveFilter(opts: {
  installed?: boolean;
  local?: boolean;
}): 'all' | 'installed' | 'local' {
  if (opts.installed) return 'installed';
  if (opts.local) return 'local';
  return 'all';
}

function printSkillEntry(s: SkillListEntry): void {
  const version = s.version ? `@${s.version}` : '';
  console.log(`  ${s.name}${version} [${s.source}] (${s.type || 'unknown'})`);
  if (s.description) console.log(`    ${s.description}`);
  console.log();
}

function printSkillsVerbose(skills: SkillListEntry[]): void {
  if (skills.length === 0) {
    logger.info('No skills found.');
    return;
  }
  console.log('Available skills:\n');
  for (const s of skills) printSkillEntry(s);
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List available skills')
    .option('--installed', 'Show only community-installed skills')
    .option('--local', 'Show only project-local skills')
    .option('--all', 'Show all skills (default)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const skills = collectSkills({ filter: resolveFilter(opts) });

      if (globalOpts.json) {
        logger.raw(skills);
      } else if (globalOpts.quiet) {
        for (const s of skills) console.log(s.name);
      } else {
        printSkillsVerbose(skills);
      }
      process.exit(ExitCode.SUCCESS);
    });
}
