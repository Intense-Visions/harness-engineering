import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a skill (outputs SKILL.md content to stdout)')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .option('--path <path>', 'Project root path for context injection')
    .action(async (name, opts, cmd) => {
      const _globalOpts = cmd.optsWithGlobals();
      const skillsDir = resolveSkillsDir();
      const skillDir = path.join(skillsDir, name);

      if (!fs.existsSync(skillDir)) {
        logger.error(`Skill not found: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        logger.error(`SKILL.md not found for skill: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      let content = fs.readFileSync(skillMdPath, 'utf-8');

      // Optionally inject project context if skill is persistent
      const yamlPath = path.join(skillDir, 'skill.yaml');
      if (opts.path && fs.existsSync(yamlPath)) {
        try {
          const raw = fs.readFileSync(yamlPath, 'utf-8');
          const parsed = parse(raw);
          const result = SkillMetadataSchema.safeParse(parsed);
          if (result.success && result.data.state.persistent) {
            const projectPath = path.resolve(opts.path);
            const stateFile = path.join(projectPath, '.harness', 'state.json');
            if (fs.existsSync(stateFile)) {
              const stateContent = fs.readFileSync(stateFile, 'utf-8');
              content += `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
            }
          }
        } catch {
          // ignore context injection errors
        }
      }

      process.stdout.write(content);
      process.exit(ExitCode.SUCCESS);
    });
}
