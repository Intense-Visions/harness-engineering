import * as path from 'path';
import * as fs from 'fs';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';
import { resolveTemplatesDir } from '../../utils/paths.js';
import { sanitizePath } from '../utils/sanitize-path.js';
import {
  persistToolingConfig,
  appendFrameworkAgents,
  ensureHarnessGitignore,
  ensureComprehensionSearchIgnore,
} from '../../templates/post-write.js';
import type { TemplateMetadata } from '../../templates/schema.js';
import { isAddOnTemplate, isNamedAddOnTemplate } from '../../templates/engine.js';
import {
  NAMED_TEMPLATE_BLOCK_ON,
  NAMED_TEMPLATE_DEFAULTS,
  NAMED_TEMPLATE_RUNNERS,
  resolveNamedTemplateVars,
  validateNamedTemplateVars,
} from '../../templates/named-template-vars.js';

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
        enum: ['basic', 'intermediate', 'load-bearing-minimum', 'advanced'],
        description:
          'Adoption level (JS/TS only). Defaults to load-bearing-minimum, which sits between intermediate and advanced: ESLint + complexity cap 15 + module-size cap + multi-persona review + outcome-eval — the minimum that holds when the senior reviewer is away. Use basic for the lightest touch.',
      },
      framework: { type: 'string', description: 'Framework overlay (e.g., nextjs, fastapi, gin)' },
      language: {
        type: 'string',
        enum: ['typescript', 'python', 'go', 'rust', 'java'],
        description: 'Target language',
      },
      template: {
        type: 'string',
        description:
          'Specific named template (e.g. orchestrator, ci-required-review, ci-pre-merge-brief). Takes precedence over level, like `harness init --template`.',
      },
      runner: {
        type: 'string',
        enum: [...NAMED_TEMPLATE_RUNNERS],
        description: `ci-* templates only: the \`harness review-ci --runner\` the rendered workflow invokes. Defaults to ${NAMED_TEMPLATE_DEFAULTS.runner}.`,
      },
      blockOn: {
        type: 'string',
        enum: [...NAMED_TEMPLATE_BLOCK_ON],
        description: `ci-* templates only: the \`harness review-ci --block-on\` level the rendered workflow uses. Defaults to ${NAMED_TEMPLATE_DEFAULTS.blockOn}.`,
      },
      baseBranch: {
        type: 'string',
        description: `ci-* templates only: the branch the rendered workflow triggers on. Defaults to ${NAMED_TEMPLATE_DEFAULTS.baseBranch}.`,
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
  template?: string;
  runner?: string;
  blockOn?: string;
  baseBranch?: string;
}

function mcpText(text: string, isError = false): McpToolResponse {
  return { content: [{ type: 'text' as const, text }], isError };
}

interface InitEngine {
  listTemplates: () => { ok: boolean; value?: TemplateMetadata[] };
  detectFramework: (dir: string) => {
    ok: boolean;
    value?: { framework: string; language: string; score: number }[];
  };
}

function findFrameworkLanguage(engine: InitEngine, framework: string): string | undefined {
  const templates = engine.listTemplates();
  if (!templates.ok || !templates.value) return undefined;
  return templates.value.find((t) => t.framework === framework)?.language;
}

function tryDetectFramework(
  engine: InitEngine,
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
  engine: InitEngine,
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

function inferLanguage(engine: InitEngine, input: InitInput): string | undefined {
  if (input.language) return input.language;
  if (!input.framework) return undefined;
  return findFrameworkLanguage(engine, input.framework);
}

function scaffoldMcp(
  engine: InstanceType<typeof import('../../templates/engine.js').TemplateEngine>,
  safePath: string,
  i: InitInput,
  language: string | undefined,
  namedAddOn: boolean
): McpToolResponse {
  const isNonJs = language && language !== 'typescript';
  // `template` takes precedence over `level`, mirroring `harness init --template`.
  const level = isNonJs ? undefined : (i.template ?? i.level ?? 'load-bearing-minimum');

  const namedVars = resolveNamedTemplateVars({
    runner: i.runner,
    blockOn: i.blockOn,
    baseBranch: i.baseBranch,
  });
  const varsError = validateNamedTemplateVars(namedVars);
  if (varsError) return mcpText(`Init failed: ${varsError}`, true);

  const resolveResult = engine.resolveTemplate(level, i.framework, language);
  if (!resolveResult.ok) return resultToMcpResponse(resolveResult);

  const renderResult = engine.render(resolveResult.value, {
    projectName: i.name ?? path.basename(safePath),
    level: level ?? '',
    ...namedVars,
    ...(i.framework !== undefined && { framework: i.framework }),
    ...(language !== undefined && { language }),
  });
  if (!renderResult.ok) return resultToMcpResponse(renderResult);

  const existingProject = engine.isExistingProject(safePath);
  const addOn = namedAddOn || isAddOnTemplate(resolveResult.value.metadata);

  const writeResult = engine.write(renderResult.value, safePath, {
    overwrite: false,
    ...(language !== undefined && { language }),
    existingProject,
    // Opt-in add-ons (ci-* etc.) write into existing projects too, exactly like
    // `harness init --template` (#2630).
    addOn,
  });

  if (writeResult.ok) {
    // An add-on leaves an existing harness.config.json byte-for-byte alone (#2670).
    if (!addOn) persistToolingConfig(safePath, resolveResult.value, i.framework);
    appendFrameworkAgents(safePath, i.framework, language);
    ensureHarnessGitignore(safePath);
    ensureComprehensionSearchIgnore(safePath);
  }

  if (writeResult.ok && writeResult.value.skippedConfigs.length > 0) {
    const skippedMsg = writeResult.value.skippedConfigs.map((f: string) => `  - ${f}`).join('\n');
    const keptMsg =
      writeResult.value.skippedExisting.length > 0
        ? `\n\nKept existing files (not overwritten):\n${writeResult.value.skippedExisting.map((f: string) => `  - ${f}`).join('\n')}`
        : '';
    return mcpText(
      `Files written: ${writeResult.value.written.join(', ')}\n\nSkipped existing config files (add harness dependencies manually):\n${skippedMsg}${keptMsg}`
    );
  }

  const response = resultToMcpResponse(writeResult);
  if (writeResult.ok && addOn && !fs.existsSync(path.join(safePath, 'harness.config.json'))) {
    // Same advice as the CLI's next steps: the add-on wrote no project config.
    response.content.push({
      type: 'text' as const,
      text: 'This directory has no harness.config.json yet: run init_project without a template (or `harness init`) to scaffold the project config before `harness validate`.',
    });
  }
  return response;
}

export async function handleInitProject(input: Record<string, unknown>): Promise<McpToolResponse> {
  const i = input as unknown as InitInput;
  try {
    const { TemplateEngine } = await import('../../templates/engine.js');
    const engine = new TemplateEngine(resolveTemplatesDir());
    const safePath = sanitizePath(i.path);

    const templates = engine.listTemplates();
    const namedAddOn = isNamedAddOnTemplate(
      templates.ok ? templates.value : [],
      i.template ?? i.level,
      i.language
    );

    // Framework detection picks a project scaffold; an add-on is not one (#2670).
    const detected = namedAddOn ? null : tryDetectFramework(engine, safePath, i);
    if (detected) return detected;

    const conflict = checkFrameworkLanguageConflict(engine, i);
    if (conflict) return conflict;

    return scaffoldMcp(engine, safePath, i, inferLanguage(engine, i), namedAddOn);
  } catch (error) {
    return mcpText(`Init failed: ${error instanceof Error ? error.message : String(error)}`, true);
  }
}
