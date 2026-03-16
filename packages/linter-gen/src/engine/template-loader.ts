import * as fs from 'fs/promises';
import * as path from 'path';

export type TemplateSourceType = 'explicit' | 'convention' | 'builtin';

export interface TemplateSource {
  type: TemplateSourceType;
  path: string;
  content: string;
}

export type TemplateLoadErrorCode = 'TEMPLATE_NOT_FOUND' | 'TEMPLATE_READ_ERROR';

export class TemplateLoadError extends Error {
  constructor(
    message: string,
    public readonly code: TemplateLoadErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateLoadError';
  }
}

export type LoadTemplateResult =
  | { success: true; source: TemplateSource }
  | { success: false; error: TemplateLoadError };

const BUILTIN_TEMPLATES = ['import-restriction', 'boundary-validation', 'dependency-graph'];

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load template content from a file
 */
async function loadTemplateFile(
  filePath: string,
  type: TemplateSourceType
): Promise<LoadTemplateResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      success: true,
      source: { type, path: filePath, content },
    };
  } catch (err) {
    return {
      success: false,
      error: new TemplateLoadError(
        `Failed to read template: ${filePath}`,
        'TEMPLATE_READ_ERROR',
        err
      ),
    };
  }
}

/**
 * Load a template by type, checking in order:
 * 1. Explicit path from templates config
 * 2. Convention path: ./templates/{type}.ts.hbs
 * 3. Built-in templates from package
 */
export async function loadTemplate(
  ruleType: string,
  templatesConfig: Record<string, string> | undefined,
  configDir: string
): Promise<LoadTemplateResult> {
  // 1. Check explicit path
  if (templatesConfig?.[ruleType]) {
    const explicitPath = path.resolve(configDir, templatesConfig[ruleType]);
    if (await fileExists(explicitPath)) {
      return loadTemplateFile(explicitPath, 'explicit');
    }
    return {
      success: false,
      error: new TemplateLoadError(
        `Explicit template not found: ${explicitPath}`,
        'TEMPLATE_NOT_FOUND'
      ),
    };
  }

  // 2. Check convention path
  const conventionPath = path.join(configDir, 'templates', `${ruleType}.ts.hbs`);
  if (await fileExists(conventionPath)) {
    return loadTemplateFile(conventionPath, 'convention');
  }

  // 3. Check built-in templates
  if (BUILTIN_TEMPLATES.includes(ruleType)) {
    const builtinPath = path.join(__dirname, '..', 'templates', `${ruleType}.ts.hbs`);
    if (await fileExists(builtinPath)) {
      return loadTemplateFile(builtinPath, 'builtin');
    }
  }

  // Template not found
  return {
    success: false,
    error: new TemplateLoadError(
      `Template not found for type '${ruleType}'. ` +
        `Checked: explicit config, ./templates/${ruleType}.ts.hbs, built-in templates.`,
      'TEMPLATE_NOT_FOUND'
    ),
  };
}
