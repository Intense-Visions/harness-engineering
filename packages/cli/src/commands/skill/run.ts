import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { SkillMetadataSchema } from '../../skill/schema';
import { detectComplexity, type Complexity } from '../../skill/complexity';
import { buildPreamble } from './preamble';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { resolveSkillsDir } from '../../utils/paths';

export function createRunCommand(): Command {
  return new Command('run')
    .description('Run a skill (outputs SKILL.md content with context preamble)')
    .argument('<name>', 'Skill name (e.g., harness-tdd)')
    .option('--path <path>', 'Project root path for context injection')
    .option('--complexity <level>', 'Complexity: auto, light, full', 'auto')
    .option('--phase <name>', 'Start at a specific phase (for re-entry)')
    .option('--party', 'Enable multi-perspective evaluation')
    .action(async (name, opts, cmd) => {
      const _globalOpts = cmd.optsWithGlobals();
      const skillsDir = resolveSkillsDir();
      const skillDir = path.join(skillsDir, name);

      if (!fs.existsSync(skillDir)) {
        logger.error(`Skill not found: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      // Load skill metadata
      const yamlPath = path.join(skillDir, 'skill.yaml');
      let metadata: ReturnType<typeof SkillMetadataSchema.parse> | null = null;
      if (fs.existsSync(yamlPath)) {
        try {
          const raw = fs.readFileSync(yamlPath, 'utf-8');
          const parsed = parse(raw);
          const result = SkillMetadataSchema.safeParse(parsed);
          if (result.success) metadata = result.data;
        } catch { /* ignore */ }
      }

      // Resolve complexity
      let complexity: 'light' | 'full' | undefined;
      if (metadata?.phases && metadata.phases.length > 0) {
        const requested = (opts.complexity as Complexity) ?? 'auto';
        if (requested === 'auto') {
          const projectPath = opts.path ? path.resolve(opts.path) : process.cwd();
          complexity = detectComplexity(projectPath);
        } else {
          complexity = requested;
        }
      }

      // Load principles
      let principles: string | undefined;
      const projectPath = opts.path ? path.resolve(opts.path) : process.cwd();
      const principlesPath = path.join(projectPath, 'docs', 'principles.md');
      if (fs.existsSync(principlesPath)) {
        principles = fs.readFileSync(principlesPath, 'utf-8');
      }

      // Handle phase re-entry
      let priorState: string | undefined;
      let stateWarning: string | undefined;
      if (opts.phase) {
        // Validate phase name
        if (metadata?.phases) {
          const validPhases = metadata.phases.map(p => p.name);
          if (!validPhases.includes(opts.phase)) {
            logger.error(`Unknown phase: ${opts.phase}. Valid phases: ${validPhases.join(', ')}`);
            process.exit(ExitCode.ERROR);
            return;
          }
        }

        // Load state if persistent
        if (metadata?.state.persistent && metadata.state.files.length > 0) {
          for (const stateFilePath of metadata.state.files) {
            const fullPath = path.join(projectPath, stateFilePath);
            if (fs.existsSync(fullPath)) {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                // Find most recent file in directory
                const files = fs.readdirSync(fullPath)
                  .map(f => ({ name: f, mtime: fs.statSync(path.join(fullPath, f)).mtimeMs }))
                  .sort((a, b) => b.mtime - a.mtime);
                if (files.length > 0) {
                  priorState = fs.readFileSync(path.join(fullPath, files[0].name), 'utf-8');
                }
              } else {
                priorState = fs.readFileSync(fullPath, 'utf-8');
              }
              break;
            }
          }
          if (!priorState) {
            stateWarning = 'No prior phase data found. Earlier phases have not been completed. Proceed with caution.';
          }
        }
      }

      // Build preamble
      const preamble = buildPreamble({
        complexity,
        phases: metadata?.phases as Array<{ name: string; description: string; required: boolean }>,
        principles,
        phase: opts.phase,
        priorState,
        stateWarning,
        party: opts.party,
      });

      // Load SKILL.md
      const skillMdPath = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        logger.error(`SKILL.md not found for skill: ${name}`);
        process.exit(ExitCode.ERROR);
        return;
      }

      let content = fs.readFileSync(skillMdPath, 'utf-8');

      // Inject project state for persistent skills (existing behavior)
      if (metadata?.state.persistent && opts.path) {
        const stateFile = path.join(projectPath, '.harness', 'state.json');
        if (fs.existsSync(stateFile)) {
          const stateContent = fs.readFileSync(stateFile, 'utf-8');
          content += `\n\n---\n## Project State\n\`\`\`json\n${stateContent}\n\`\`\`\n`;
        }
      }

      // Output: preamble + content
      process.stdout.write(preamble + content);
      process.exit(ExitCode.SUCCESS);
    });
}
