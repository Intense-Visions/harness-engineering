import * as path from 'path';
import { resultToMcpResponse } from '../utils/result-adapter.js';
import { resolveTemplatesDir } from '../utils/paths.js';

export const initProjectDefinition = {
  name: 'init_project',
  description: 'Scaffold a new harness engineering project from a template',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Target directory' },
      name: { type: 'string', description: 'Project name' },
      level: { type: 'string', enum: ['basic', 'intermediate', 'advanced'], description: 'Adoption level' },
      framework: { type: 'string', description: 'Framework overlay (e.g., nextjs)' },
    },
    required: ['path'],
  },
};

export async function handleInitProject(input: { path: string; name?: string; level?: string; framework?: string }) {
  try {
    // Import TemplateEngine - ensure CLI exports it
    const { TemplateEngine } = await import('@harness-engineering/cli');
    const templatesDir = resolveTemplatesDir();
    const engine = new TemplateEngine(templatesDir);
    const level = input.level ?? 'basic';

    const resolveResult = engine.resolveTemplate(level, input.framework);
    if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

    const renderResult = engine.render(resolveResult.value, {
      projectName: input.name ?? path.basename(input.path),
      level,
      framework: input.framework,
    });
    if (!renderResult.ok) return resultToMcpResponse(renderResult);

    const writeResult = engine.write(renderResult.value, path.resolve(input.path), { overwrite: false });
    return resultToMcpResponse(writeResult);
  } catch (error) {
    return { content: [{ type: 'text' as const, text: `Init failed: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
  }
}
