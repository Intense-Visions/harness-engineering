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

/**
 * Collect skills from all sources with deduplication.
 * Priority: local > community > bundled (first found wins).
 */
export function collectSkills(opts: CollectOptions): SkillListEntry[] {
  const seen = new Set<string>();
  const allSkills: SkillListEntry[] = [];

  const addUnique = (entries: SkillListEntry[]) => {
    for (const entry of entries) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        allSkills.push(entry);
      }
    }
  };

  // 1. Project-local skills
  if (opts.filter === 'all' || opts.filter === 'local') {
    const projectDir = resolveProjectSkillsDir();
    if (projectDir) {
      addUnique(scanDirectory(projectDir, 'local'));
    }
  }

  // 2. Community-installed skills (from lockfile)
  if (opts.filter === 'all' || opts.filter === 'installed') {
    const globalDir = resolveGlobalSkillsDir();
    const skillsDir = path.dirname(globalDir);
    const communityBase = path.join(skillsDir, 'community');
    const lockfilePath = path.join(communityBase, 'skills-lock.json');
    const lockfile = readLockfile(lockfilePath);

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
  }

  // 3. Bundled/global skills
  if (opts.filter === 'all') {
    const globalDir = resolveGlobalSkillsDir();
    addUnique(scanDirectory(globalDir, 'bundled'));
  }

  // For installed-only, return only community entries
  if (opts.filter === 'installed') {
    return allSkills.filter((s) => s.source === 'community');
  }

  // For local-only, return only local entries
  if (opts.filter === 'local') {
    return allSkills.filter((s) => s.source === 'local');
  }

  return allSkills;
}

export function createListCommand(): Command {
  return new Command('list')
    .description('List available skills')
    .option('--installed', 'Show only community-installed skills')
    .option('--local', 'Show only project-local skills')
    .option('--all', 'Show all skills (default)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      let filter: 'all' | 'installed' | 'local' = 'all';
      if (opts.installed) filter = 'installed';
      else if (opts.local) filter = 'local';

      const skills = collectSkills({ filter });

      if (globalOpts.json) {
        logger.raw(skills);
      } else if (globalOpts.quiet) {
        for (const s of skills) console.log(s.name);
      } else {
        if (skills.length === 0) {
          logger.info('No skills found.');
        } else {
          console.log('Available skills:\n');
          for (const s of skills) {
            const version = s.version ? `@${s.version}` : '';
            console.log(`  ${s.name}${version} [${s.source}] (${s.type || 'unknown'})`);
            if (s.description) {
              console.log(`    ${s.description}`);
            }
            console.log();
          }
        }
      }
      process.exit(ExitCode.SUCCESS);
    });
}
