import Handlebars from 'handlebars';
import type { RuleContext } from './context-builder.js';

export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}

export type RenderResult =
  | { success: true; output: string }
  | { success: false; error: TemplateError };

/**
 * Convert kebab-case to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/-([a-z0-9])/g, (_: string, char: string) => char.toUpperCase());
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

// Register Handlebars helpers
Handlebars.registerHelper('json', (obj: unknown) => JSON.stringify(obj));

Handlebars.registerHelper('jsonPretty', (obj: unknown) => JSON.stringify(obj, null, 2));

Handlebars.registerHelper('camelCase', (str: string) => toCamelCase(str));

Handlebars.registerHelper('pascalCase', (str: string) => toPascalCase(str));

/**
 * Render a Handlebars template with the given context
 */
export function renderTemplate(templateSource: string, context: RuleContext): RenderResult {
  try {
    const compiled = Handlebars.compile(templateSource, { strict: true });
    const output = compiled(context);
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      error: new TemplateError(`Template rendering failed: ${(err as Error).message}`, err),
    };
  }
}
