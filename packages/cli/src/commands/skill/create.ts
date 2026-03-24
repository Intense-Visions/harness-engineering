import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import YAML from 'yaml';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';

const KEBAB_CASE_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

export interface CreateResult {
  name: string;
  directory: string;
  files: string[];
}

interface CreateOptions {
  description?: string;
  type?: string;
  platforms?: string;
  triggers?: string;
  outputDir?: string;
}

function buildReadme(name: string, description: string): string {
  return `# @harness-skills/${name}

${description}

## Installation

\`\`\`bash
harness install ${name}
\`\`\`

## Usage

This skill is automatically available after installation. Invoke it via:

\`\`\`bash
harness skill run ${name}
\`\`\`

Or use the slash command \`/${name}\` in your AI coding assistant.

## Development

Edit \`skill.yaml\` to configure the skill metadata and \`SKILL.md\` to define the skill's behavior.

### Validate

\`\`\`bash
harness skill validate ${name}
\`\`\`

### Publish

\`\`\`bash
harness skills publish
\`\`\`
`;
}

function buildSkillYaml(name: string, opts: CreateOptions): Record<string, unknown> {
  const platforms = opts.platforms
    ? opts.platforms.split(',').map((p) => p.trim())
    : ['claude-code'];
  const triggers = opts.triggers ? opts.triggers.split(',').map((t) => t.trim()) : ['manual'];

  return {
    name,
    version: '0.1.0',
    description: opts.description || `A community skill: ${name}`,
    triggers,
    platforms,
    tools: ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'],
    type: opts.type || 'flexible',
    state: {
      persistent: false,
      files: [],
    },
    depends_on: [],
  };
}

function buildSkillMd(name: string, description: string): string {
  return `# ${name}

${description}

## When to Use

- [Describe when this skill should be invoked]
- [Describe the trigger conditions]

## Process

1. [Describe the step-by-step process]
2. [Add additional steps as needed]

## Success Criteria

- [Define what a successful execution looks like]
- [Add measurable criteria]
`;
}

/**
 * Create a new skill directory with skill.yaml, SKILL.md, and README.md.
 */
export function runCreate(name: string, opts: CreateOptions): CreateResult {
  if (!KEBAB_CASE_RE.test(name)) {
    throw new Error(`Invalid skill name "${name}". Must be kebab-case (e.g., my-skill).`);
  }

  const baseDir = opts.outputDir ?? path.join(process.cwd(), 'agents', 'skills', 'claude-code');
  const skillDir = path.join(baseDir, name);

  if (fs.existsSync(skillDir)) {
    throw new Error(`Skill directory already exists: ${skillDir}`);
  }

  fs.mkdirSync(skillDir, { recursive: true });

  const description = opts.description || `A community skill: ${name}`;

  // skill.yaml
  const skillYaml = buildSkillYaml(name, opts);
  const skillYamlPath = path.join(skillDir, 'skill.yaml');
  fs.writeFileSync(skillYamlPath, YAML.stringify(skillYaml));

  // SKILL.md
  const skillMd = buildSkillMd(name, description);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(skillMdPath, skillMd);

  // README.md (npm landing page)
  const readme = buildReadme(name, description);
  const readmePath = path.join(skillDir, 'README.md');
  fs.writeFileSync(readmePath, readme);

  return {
    name,
    directory: skillDir,
    files: [skillYamlPath, skillMdPath, readmePath],
  };
}

export function createCreateCommand(): Command {
  return new Command('create')
    .description('Scaffold a new community skill')
    .argument('<name>', 'Skill name (kebab-case)')
    .option('--description <desc>', 'Skill description')
    .option('--type <type>', 'Skill type: rigid or flexible', 'flexible')
    .option('--platforms <platforms>', 'Comma-separated platforms (default: claude-code)')
    .option('--triggers <triggers>', 'Comma-separated triggers (default: manual)')
    .option('--output-dir <dir>', 'Output directory (default: agents/skills/claude-code/)')
    .action(async (name: string, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      try {
        const result = runCreate(name, {
          description: opts.description,
          type: opts.type,
          platforms: opts.platforms,
          triggers: opts.triggers,
          outputDir: opts.outputDir,
        });

        if (globalOpts.json) {
          logger.raw(result);
        } else {
          logger.success(`Created skill "${name}"`);
          for (const f of result.files) {
            logger.info(`  ${f}`);
          }
          logger.info(`\nNext steps:`);
          logger.info(
            `  1. Edit ${path.join(result.directory, 'SKILL.md')} with your skill content`
          );
          logger.info(`  2. Run: harness skill validate ${name}`);
          logger.info(`  3. Run: harness skills publish`);
        }
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(ExitCode.VALIDATION_FAILED);
      }
    });
}
