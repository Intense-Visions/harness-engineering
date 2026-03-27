import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveTemplatesDir } from '../../utils/paths.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const initProjectDefinition = {
  name: 'init_project',
  description: 'Scaffold a new harness engineering project from a template',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Target directory' },
      name: { type: 'string', description: 'Project name' },
      level: {
        type: 'string',
        enum: ['basic', 'intermediate', 'advanced'],
        description: 'Adoption level (JS/TS only)',
      },
      framework: { type: 'string', description: 'Framework overlay (e.g., nextjs, fastapi, gin)' },
      language: {
        type: 'string',
        enum: ['typescript', 'python', 'go', 'rust', 'java'],
        description: 'Target language',
      },
    },
    required: ['path'],
  },
};

export async function handleInitProject(input: {
  path: string;
  name?: string;
  level?: string;
  framework?: string;
  language?: string;
}) {
  try {
    // Import TemplateEngine - ensure CLI exports it
    const { TemplateEngine } = await import('../../templates/engine.js');
    const templatesDir = resolveTemplatesDir();
    const engine = new TemplateEngine(templatesDir);

    const language = input.language;
    const isNonJs = language && language !== 'typescript';
    const level = isNonJs ? undefined : (input.level ?? 'basic');

    const resolveResult = engine.resolveTemplate(level, input.framework, language);
    if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

    const safePath = sanitizePath(input.path);
    const renderResult = engine.render(resolveResult.value, {
      projectName: input.name ?? path.basename(safePath),
      level: level ?? '',
      ...(input.framework !== undefined && { framework: input.framework }),
      ...(language !== undefined && { language }),
    });
    if (!renderResult.ok) return resultToMcpResponse(renderResult);

    const writeResult = engine.write(renderResult.value, safePath, {
      overwrite: false,
      ...(language !== undefined && { language }),
    });

    if (writeResult.ok && writeResult.value.skippedConfigs.length > 0) {
      const skippedMsg = writeResult.value.skippedConfigs.map((f: string) => `  - ${f}`).join('\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Files written: ${writeResult.value.written.join(', ')}\n\nSkipped existing config files (add harness dependencies manually):\n${skippedMsg}`,
          },
        ],
        isError: false,
      };
    }

    return resultToMcpResponse(writeResult);
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Init failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
