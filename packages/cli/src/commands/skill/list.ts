import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

export function createListCommand(): Command {
  return new Command('list').description('List available skills').action(async (_opts, cmd) => {
    const globalOpts = cmd.optsWithGlobals();
    const skillsDir = resolveSkillsDir();

    if (!fs.existsSync(skillsDir)) {
      logger.info('No skills directory found.');
      process.exit(ExitCode.SUCCESS);
      return;
    }

    const entries = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const skills = [];
    for (const name of entries) {
      const yamlPath = path.join(skillsDir, name, 'skill.yaml');
      if (!fs.existsSync(yamlPath)) continue;
      try {
        const raw = fs.readFileSync(yamlPath, 'utf-8');
        const parsed = parse(raw);
        const result = SkillMetadataSchema.safeParse(parsed);
        if (result.success) {
          skills.push(result.data);
        }
      } catch {
        // skip invalid entries
      }
    }

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
          console.log(`  ${s.name} (${s.type})`);
          console.log(`    ${s.description}\n`);
        }
      }
    }
    process.exit(ExitCode.SUCCESS);
  });
}
