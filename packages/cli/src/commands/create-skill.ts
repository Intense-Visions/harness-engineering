import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import YAML from 'yaml';
import { ALLOWED_COGNITIVE_MODES } from '../skill/schema';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

export interface CreateSkillOptions {
  name: string;
  description: string;
  cognitiveMode?: string;
  reads?: string[];
  produces?: string;
  preChecks?: string[];
  postChecks?: string[];
  outputDir?: string;
}

interface GeneratedFiles {
  skillYamlPath: string;
  skillMdPath: string;
}

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function buildSkillYaml(opts: CreateSkillOptions): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: opts.name,
    version: '0.1.0',
    description: opts.description,
    cognitive_mode: opts.cognitiveMode ?? 'constructive-architect',
    triggers: ['manual'],
    platforms: ['claude-code'],
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    type: 'flexible',
    state: {
      persistent: false,
      files: [],
    },
    depends_on: [],
  };

  return doc;
}

function buildSkillMd(opts: CreateSkillOptions): string {
  const mode = opts.cognitiveMode ?? 'constructive-architect';
  const readsSection =
    opts.reads && opts.reads.length > 0
      ? opts.reads.map((r) => `- \`${r}\``).join('\n')
      : '- _No read patterns specified_';
  const producesLine = opts.produces ? `- \`${opts.produces}\`` : '- _No output specified_';
  const preChecksSection =
    opts.preChecks && opts.preChecks.length > 0
      ? opts.preChecks.map((c) => `- \`${c}\``).join('\n')
      : '- _None_';
  const postChecksSection =
    opts.postChecks && opts.postChecks.length > 0
      ? opts.postChecks.map((c) => `- \`${c}\``).join('\n')
      : '- _None_';

  return `# ${opts.name}

> Cognitive Mode: ${mode}

${opts.description}

## When to Use

- _TODO: describe when this skill should be invoked_
- _TODO: describe the trigger conditions_

## Context Assembly

### Reads
${readsSection}

### Produces
${producesLine}

## Deterministic Checks

### Pre-checks
${preChecksSection}

### Post-checks
${postChecksSection}

## Process

1. _TODO: describe the step-by-step process_
2. _TODO: add additional steps_

## Harness Integration

This skill integrates with the harness engineering workflow. It can be invoked via:

\`\`\`bash
harness skill run ${opts.name}
\`\`\`

## Success Criteria

- _TODO: define what success looks like_
- _TODO: add measurable criteria_

## Examples

\`\`\`
# TODO: add usage examples
\`\`\`
`;
}

export function generateSkillFiles(opts: CreateSkillOptions): GeneratedFiles {
  // Validate name
  if (!KEBAB_CASE_RE.test(opts.name)) {
    throw new CLIError(
      `Invalid skill name "${opts.name}". Must be kebab-case (e.g., my-skill).`,
      ExitCode.VALIDATION_FAILED
    );
  }

  // Validate cognitive mode if provided
  if (
    opts.cognitiveMode &&
    !(ALLOWED_COGNITIVE_MODES as readonly string[]).includes(opts.cognitiveMode)
  ) {
    throw new CLIError(
      `Invalid cognitive mode "${opts.cognitiveMode}". Allowed: ${ALLOWED_COGNITIVE_MODES.join(', ')}`,
      ExitCode.VALIDATION_FAILED
    );
  }

  const baseDir = opts.outputDir ?? path.join(process.cwd(), 'agents', 'skills', 'claude-code');
  const skillDir = path.join(baseDir, opts.name);

  // Check if skill directory already exists
  if (fs.existsSync(skillDir)) {
    throw new CLIError(`Skill directory already exists: ${skillDir}`, ExitCode.VALIDATION_FAILED);
  }

  // Create the directory
  fs.mkdirSync(skillDir, { recursive: true });

  // Generate skill.yaml
  const skillYaml = buildSkillYaml(opts);
  const skillYamlPath = path.join(skillDir, 'skill.yaml');
  fs.writeFileSync(skillYamlPath, YAML.stringify(skillYaml));

  // Generate SKILL.md
  const skillMd = buildSkillMd(opts);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillMdPath, skillMd);

  return { skillYamlPath, skillMdPath };
}

export function createCreateSkillCommand(): Command {
  const command = new Command('create-skill')
    .description('Scaffold a new skill with skill.yaml and SKILL.md')
    .requiredOption('--name <name>', 'Skill name (kebab-case)')
    .requiredOption('--description <desc>', 'Skill description')
    .option(
      '--cognitive-mode <mode>',
      `Cognitive mode (${ALLOWED_COGNITIVE_MODES.join(', ')})`,
      'constructive-architect'
    )
    .option('--reads <patterns...>', 'File patterns the skill reads')
    .option('--produces <output>', 'What the skill produces')
    .option('--pre-checks <commands...>', 'Pre-check commands')
    .option('--post-checks <commands...>', 'Post-check commands')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();

      try {
        const result = generateSkillFiles({
          name: opts.name,
          description: opts.description,
          cognitiveMode: opts.cognitiveMode,
          reads: opts.reads,
          produces: opts.produces,
          preChecks: opts.preChecks,
          postChecks: opts.postChecks,
        });

        if (!globalOpts.quiet) {
          logger.success(`Created skill "${opts.name}"`);
          logger.info(`  ${result.skillYamlPath}`);
          logger.info(`  ${result.skillMdPath}`);
        }

        if (globalOpts.json) {
          logger.raw({
            name: opts.name,
            files: [result.skillYamlPath, result.skillMdPath],
          });
        }
      } catch (error) {
        if (error instanceof CLIError) {
          if (globalOpts.json) {
            console.log(JSON.stringify({ error: error.message }));
          } else {
            logger.error(error.message);
          }
          process.exit(error.exitCode);
        }
        throw error;
      }
    });

  return command;
}
