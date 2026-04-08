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
    platforms: ['claude-code', 'gemini-cli'],
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

function toListSection(items: string[] | undefined, fallback: string): string {
  return items && items.length > 0 ? items.map((i) => `- \`${i}\``).join('\n') : fallback;
}

function buildSkillMdSections(opts: CreateSkillOptions): Record<string, string> {
  return {
    mode: opts.cognitiveMode ?? 'constructive-architect',
    reads: toListSection(opts.reads, '- _No read patterns specified_'),
    produces: opts.produces ? `- \`${opts.produces}\`` : '- _No output specified_',
    preChecks: toListSection(opts.preChecks, '- _None_'),
    postChecks: toListSection(opts.postChecks, '- _None_'),
  };
}

function buildSkillMd(opts: CreateSkillOptions): string {
  const { mode, reads, produces, preChecks, postChecks } = buildSkillMdSections(opts);
  const run = `harness skill run ${opts.name}`;

  return `# ${opts.name}

> Cognitive Mode: ${mode}

${opts.description}

## When to Use

- [Describe when this skill should be invoked]
- [Describe the trigger conditions]

## Context Assembly

### Reads
${reads}

### Produces
${produces}

## Deterministic Checks

### Pre-checks
${preChecks}

### Post-checks
${postChecks}

## Process

1. [Describe the step-by-step process]
2. [Add additional steps as needed]

## Harness Integration

This skill integrates with the harness engineering workflow. It can be invoked via:

\`\`\`bash
${run}
\`\`\`

## Success Criteria

- [Define what a successful execution looks like]
- [Add measurable criteria]

## Examples

\`\`\`bash
${run}
\`\`\`

## Rationalizations to Reject

<!-- TODO: Add 3-8 domain-specific rationalizations. Do not repeat universal rationalizations (defined in harness-skill-authoring). -->

| Rationalization | Reality |
| --- | --- |
| "[Domain-specific excuse]" | [Why this is wrong and what to do instead] |
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

function handleSkillError(error: unknown, json: boolean): never {
  if (!(error instanceof CLIError)) throw error;
  if (json) {
    console.log(JSON.stringify({ error: error.message }));
  } else {
    logger.error(error.message);
  }
  process.exit(error.exitCode);
}

async function runCreateSkillAction(
  opts: CreateSkillOptions & { quiet?: boolean; json?: boolean }
): Promise<void> {
  try {
    const result = generateSkillFiles(opts);

    if (!opts.quiet) {
      logger.success(`Created skill "${opts.name}"`);
      logger.info(`  ${result.skillYamlPath}`);
      logger.info(`  ${result.skillMdPath}`);
    }

    if (opts.json) {
      logger.raw({ name: opts.name, files: [result.skillYamlPath, result.skillMdPath] });
    }
  } catch (error) {
    handleSkillError(error, opts.json ?? false);
  }
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
      await runCreateSkillAction({
        name: opts.name,
        description: opts.description,
        cognitiveMode: opts.cognitiveMode,
        reads: opts.reads,
        produces: opts.produces,
        preChecks: opts.preChecks,
        postChecks: opts.postChecks,
        quiet: globalOpts.quiet,
        json: globalOpts.json,
      });
    });

  return command;
}
