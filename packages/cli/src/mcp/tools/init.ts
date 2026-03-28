import * as path from 'path';
import * as fs from 'fs';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';
import { resolveTemplatesDir } from '../../utils/paths.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import { persistToolingConfig, appendFrameworkAgents } from '../../templates/post-write.js';

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

interface InitInput {
  path: string;
  name?: string;
  level?: string;
  framework?: string;
  language?: string;
}

function mcpText(text: string, isError = false): McpToolResponse {
  return { content: [{ type: 'text' as const, text }], isError };
}

function findFrameworkLanguage(
  engine: {
    listTemplates: () => { ok: boolean; value?: { framework?: string; language?: string }[] };
  },
  framework: string
): string | undefined {
  const templates = engine.listTemplates();
  if (!templates.ok || !templates.value) return undefined;
  return templates.value.find((t) => t.framework === framework)?.language;
}

function tryDetectFramework(
  engine: {
    detectFramework: (dir: string) => {
      ok: boolean;
      value?: { framework: string; language: string; score: number }[];
    };
  },
  safePath: string,
  input: InitInput
): McpToolResponse | null {
  if (input.framework || input.language || !fs.existsSync(safePath)) return null;
  const result = engine.detectFramework(safePath);
  if (!result.ok || !result.value || result.value.length === 0) return null;
  const candidates = result.value
    .map((c) => `${c.framework} (${c.language}, score: ${c.score})`)
    .join(', ');
  return mcpText(
    `Detected frameworks: ${candidates}\n\nRe-invoke with --framework <name> to scaffold, or specify --language for a bare scaffold.`
  );
}

function checkFrameworkLanguageConflict(
  engine: {
    listTemplates: () => { ok: boolean; value?: { framework?: string; language?: string }[] };
  },
  input: InitInput
): McpToolResponse | null {
  if (!input.framework || !input.language) return null;
  const fwLang = findFrameworkLanguage(engine, input.framework);
  if (fwLang && fwLang !== input.language) {
    return mcpText(
      `Framework "${input.framework}" is a ${fwLang} framework, but language "${input.language}" was specified. Use language "${fwLang}" instead.`,
      true
    );
  }
  return null;
}

function inferLanguage(
  engine: {
    listTemplates: () => { ok: boolean; value?: { framework?: string; language?: string }[] };
  },
  input: InitInput
): string | undefined {
  if (input.language) return input.language;
  if (!input.framework) return undefined;
  return findFrameworkLanguage(engine, input.framework);
}

function scaffoldMcp(
  engine: InstanceType<typeof import('../../templates/engine.js').TemplateEngine>,
  safePath: string,
  i: InitInput,
  language: string | undefined
): McpToolResponse {
  const isNonJs = language && language !== 'typescript';
  const level = isNonJs ? undefined : (i.level ?? 'basic');

  const resolveResult = engine.resolveTemplate(level, i.framework, language);
  if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

  const renderResult = engine.render(resolveResult.value, {
    projectName: i.name ?? path.basename(safePath),
    level: level ?? '',
    ...(i.framework !== undefined && { framework: i.framework }),
    ...(language !== undefined && { language }),
  });
  if (!renderResult.ok) return resultToMcpResponse(renderResult);

  const writeResult = engine.write(renderResult.value, safePath, {
    overwrite: false,
    ...(language !== undefined && { language }),
  });

  if (writeResult.ok) {
    persistToolingConfig(safePath, resolveResult.value, i.framework);
    appendFrameworkAgents(safePath, i.framework, language);
  }

  if (writeResult.ok && writeResult.value.skippedConfigs.length > 0) {
    const skippedMsg = writeResult.value.skippedConfigs.map((f: string) => `  - ${f}`).join('\n');
    return mcpText(
      `Files written: ${writeResult.value.written.join(', ')}\n\nSkipped existing config files (add harness dependencies manually):\n${skippedMsg}`
    );
  }

  return resultToMcpResponse(writeResult);
}

export async function handleInitProject(input: Record<string, unknown>): Promise<McpToolResponse> {
  const i = input as unknown as InitInput;
  try {
    const { TemplateEngine } = await import('../../templates/engine.js');
    const engine = new TemplateEngine(resolveTemplatesDir());
    const safePath = sanitizePath(i.path);

    const detected = tryDetectFramework(engine, safePath, i);
    if (detected) return detected;

    const conflict = checkFrameworkLanguageConflict(engine, i);
    if (conflict) return conflict;

    return scaffoldMcp(engine, safePath, i, inferLanguage(engine, i));
  } catch (error) {
    return mcpText(`Init failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
