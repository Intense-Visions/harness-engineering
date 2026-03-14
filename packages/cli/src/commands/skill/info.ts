import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

export function createInfoCommand(): Command {
  return new Command('info')
    .description('Show metadata for a skill')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .action(async (name, _opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const skillsDir = resolveSkillsDir();
      const skillDir = path.join(skillsDir, name);

      if (!fs.existsSync(skillDir)) {
        logger.error(`Skill not found: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      const yamlPath = path.join(skillDir, 'skill.yaml');
      if (!fs.existsSync(yamlPath)) {
        logger.error(`skill.yaml not found for skill: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      try {
        const raw = fs.readFileSync(yamlPath, 'utf-8');
        const parsed = parse(raw);
        const result = SkillMetadataSchema.safeParse(parsed);
        if (!result.success) {
          logger.error(`Invalid skill.yaml: ${result.error.message}`);
          process.exit(ExitCode.ERROR);
          return;
        }

        const skill = result.data;
        if (globalOpts.json) {
          logger.raw(skill);
        } else {
          console.log(`Name:        ${skill.name}`);
          console.log(`Version:     ${skill.version}`);
          console.log(`Type:        ${skill.type}`);
          console.log(`Description: ${skill.description}`);
          console.log(`Triggers:    ${skill.triggers.join(', ')}`);
          console.log(`Platforms:   ${skill.platforms.join(', ')}`);
          console.log(`Tools:       ${skill.tools.join(', ')}`);
          if (skill.phases && skill.phases.length > 0) {
            console.log(`Phases:`);
            for (const p of skill.phases) {
              console.log(`  - ${p.name}: ${p.description}`);
            }
          }
          if (skill.depends_on.length > 0) {
            console.log(`Depends on:  ${skill.depends_on.join(', ')}`);
          }
          console.log(`Persistent:  ${skill.state.persistent}`);
        }
      } catch (e) {
        logger.error(`Failed to read skill: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(ExitCode.ERROR);
        return;
      }
      process.exit(ExitCode.SUCCESS);
    });
}
