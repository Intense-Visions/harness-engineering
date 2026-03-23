import { sanitizePath } from '../utils/sanitize-path.js';

export const generateLinterDefinition = {
  name: 'generate_linter',
  description: 'Generate an ESLint rule from YAML configuration',
  inputSchema: {
    type: 'object' as const,
    properties: {
      configPath: { type: 'string', description: 'Path to harness-linter.yml' },
      outputDir: { type: 'string', description: 'Output directory for generated rule' },
    },
    required: ['configPath'],
  },
};

export async function handleGenerateLinter(input: { configPath: string; outputDir?: string }) {
  try {
    const { generate } = await import('@harness-engineering/linter-gen');
    const result = await generate({
      configPath: sanitizePath(input.configPath),
      ...(input.outputDir !== undefined && { outputDir: sanitizePath(input.outputDir) }),
    });
    if ('success' in result && result.success) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

export const validateLinterConfigDefinition = {
  name: 'validate_linter_config',
  description: 'Validate a harness-linter.yml configuration file',
  inputSchema: {
    type: 'object' as const,
    properties: {
      configPath: { type: 'string', description: 'Path to harness-linter.yml' },
    },
    required: ['configPath'],
  },
};

export async function handleValidateLinterConfig(input: { configPath: string }) {
  try {
    const { validate } = await import('@harness-engineering/linter-gen');
    const result = await validate({ configPath: sanitizePath(input.configPath) });
    if ('success' in result && result.success) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], isError: true };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
