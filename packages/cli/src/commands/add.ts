// packages/cli/src/commands/add.ts
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';

type ComponentType = 'layer' | 'module' | 'doc' | 'skill' | 'persona';

interface AddOptions {
  cwd?: string;
  configPath?: string;
}

interface AddResult {
  created: string[];
}

const LAYER_INDEX_TEMPLATE = (name: string): string => `// ${name} layer
// Add your ${name} exports here

export {};
`;

const MODULE_TEMPLATE = (name: string): string => `/**
 * ${name} module
 */

export function ${name}(): void {
  // Add implementation
}
`;

const DOC_TEMPLATE = (name: string): string => `# ${name}

## Overview

[Describe what ${name} does and why it exists.]

## Usage

\`\`\`typescript
import { ${name} } from './${name}';
\`\`\`
`;

export async function runAdd(
  componentType: ComponentType,
  name: string,
  options: AddOptions
): Promise<Result<AddResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  // Validate name to prevent path traversal and invalid characters
  const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
  if (!name || !NAME_PATTERN.test(name)) {
    return Err(
      new CLIError(
        'Invalid name. Must start with a letter and contain only alphanumeric characters, hyphens, and underscores.',
        ExitCode.ERROR
      )
    );
  }

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    // Allow adding without config for basic scaffolding
  }

  const created: string[] = [];

  try {
    switch (componentType) {
      case 'layer': {
        const layerDir = path.join(cwd, 'src', name);
        if (!fs.existsSync(layerDir)) {
          fs.mkdirSync(layerDir, { recursive: true });
          created.push(`src/${name}/`);
        }
        const indexPath = path.join(layerDir, 'index.ts');
        if (!fs.existsSync(indexPath)) {
          fs.writeFileSync(indexPath, LAYER_INDEX_TEMPLATE(name));
          created.push(`src/${name}/index.ts`);
        }
        break;
      }

      case 'module': {
        const modulePath = path.join(cwd, 'src', `${name}.ts`);
        if (fs.existsSync(modulePath)) {
          return Err(new CLIError(`Module ${name} already exists`, ExitCode.ERROR));
        }
        fs.writeFileSync(modulePath, MODULE_TEMPLATE(name));
        created.push(`src/${name}.ts`);
        break;
      }

      case 'doc': {
        const configDocsDir = configResult.ok ? configResult.value.docsDir : './docs';
        const docsDir = path.resolve(cwd, configDocsDir);
        if (!fs.existsSync(docsDir)) {
          fs.mkdirSync(docsDir, { recursive: true });
        }
        const docPath = path.join(docsDir, `${name}.md`);
        if (fs.existsSync(docPath)) {
          return Err(new CLIError(`Doc ${name} already exists`, ExitCode.ERROR));
        }
        fs.writeFileSync(docPath, DOC_TEMPLATE(name));
        created.push(`${configDocsDir.replace(/^\.[\\/]/, '')}/${name}.md`);
        break;
      }

      case 'skill': {
        const { generateSkillFiles } = await import('./create-skill');
        generateSkillFiles({
          name,
          description: `${name} skill`,
          outputDir: path.join(cwd, 'agents', 'skills', 'claude-code'),
        });
        created.push(`agents/skills/claude-code/${name}/skill.yaml`);
        created.push(`agents/skills/claude-code/${name}/SKILL.md`);
        break;
      }

      case 'persona': {
        const personasDir = path.join(cwd, 'agents', 'personas');
        if (!fs.existsSync(personasDir)) {
          fs.mkdirSync(personasDir, { recursive: true });
        }
        const personaPath = path.join(personasDir, `${name}.yaml`);
        if (fs.existsSync(personaPath)) {
          return Err(new CLIError(`Persona ${name} already exists`, ExitCode.ERROR));
        }
        fs.writeFileSync(
          personaPath,
          `name: ${name}\ndescription: ${name} persona\ntriggers:\n  - manual\nfocus_areas: []\n`
        );
        created.push(`agents/personas/${name}.yaml`);
        break;
      }

      default: {
        const _exhaustive: never = componentType;
        return Err(
          new CLIError(
            `Unknown component type: ${String(_exhaustive)}. Use: layer, module, doc, skill, persona`,
            ExitCode.ERROR
          )
        );
      }
    }

    return Ok({ created });
  } catch (error) {
    return Err(
      new CLIError(
        `Failed to add ${componentType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ExitCode.ERROR
      )
    );
  }
}

export function createAddCommand(): Command {
  const command = new Command('add')
    .description('Add a component to the project')
    .argument('<type>', 'Component type (layer, module, doc, skill, persona)')
    .argument('<name>', 'Component name')
    .action(async (type: string, name: string, _opts: unknown, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals();

      const result = await runAdd(type as ComponentType, name, {
        ...(globalOpts.config !== undefined && { configPath: globalOpts.config }),
      });

      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }

      if (!globalOpts.quiet) {
        logger.success(`Added ${type}: ${name}`);
        for (const file of result.value.created) {
          console.log(`  + ${file}`);
        }
      }

      process.exit(ExitCode.SUCCESS);
    });

  return command;
}
