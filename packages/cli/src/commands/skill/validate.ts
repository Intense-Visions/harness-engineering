import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

const REQUIRED_SECTIONS = [
  '## When to Use',
  '## Process',
  '## Harness Integration',
  '## Success Criteria',
  '## Examples',
];

export function createValidateCommand(): Command {
  return new Command('validate')
    .description('Validate all skill.yaml files and SKILL.md structure')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const skillsDir = resolveSkillsDir();

      if (!fs.existsSync(skillsDir)) {
        logger.info('No skills directory found.');
        process.exit(ExitCode.SUCCESS);
        return;
      }

      const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      const errors: string[] = [];
      let validated = 0;

      for (const name of entries) {
        const skillDir = path.join(skillsDir, name);
        const yamlPath = path.join(skillDir, 'skill.yaml');
        const skillMdPath = path.join(skillDir, 'SKILL.md');

        if (!fs.existsSync(yamlPath)) {
          errors.push(`${name}: missing skill.yaml`);
          continue;
        }

        // Validate skill.yaml schema
        try {
          const raw = fs.readFileSync(yamlPath, 'utf-8');
          const parsed = parse(raw);
          const result = SkillMetadataSchema.safeParse(parsed);
          if (!result.success) {
            errors.push(`${name}/skill.yaml: ${result.error.message}`);
            continue;
          }

          // Validate SKILL.md if it exists
          if (fs.existsSync(skillMdPath)) {
            const mdContent = fs.readFileSync(skillMdPath, 'utf-8');
            for (const section of REQUIRED_SECTIONS) {
              if (!mdContent.includes(section)) {
                errors.push(`${name}/SKILL.md: missing section "${section}"`);
              }
            }
            if (!mdContent.trim().startsWith('# ')) {
              errors.push(`${name}/SKILL.md: must start with an h1 heading`);
            }
            // Rigid skills need Gates + Escalation
            if (result.data.type === 'rigid') {
              if (!mdContent.includes('## Gates')) {
                errors.push(`${name}/SKILL.md: rigid skill missing "## Gates" section`);
              }
              if (!mdContent.includes('## Escalation')) {
                errors.push(`${name}/SKILL.md: rigid skill missing "## Escalation" section`);
              }
            }
          } else {
            errors.push(`${name}: missing SKILL.md`);
          }

          validated++;
        } catch (e) {
          errors.push(`${name}: parse error — ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (globalOpts.json) {
        logger.raw({ validated, errors });
      } else if (errors.length > 0) {
        logger.error(`Validation failed with ${errors.length} error(s):`);
        for (const err of errors) console.error(`  - ${err}`);
        process.exit(ExitCode.ERROR);
      } else {
        if (!globalOpts.quiet) {
          logger.success(`All ${validated} skill(s) validated successfully.`);
        }
      }
      process.exit(ExitCode.SUCCESS);
    });
}
