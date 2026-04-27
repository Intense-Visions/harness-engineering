import { sanitizePath } from '../utils/sanitize-path.js';

export const generateBlueprintDefinition = {
  name: 'generate_blueprint',
  description:
    'Scan a project and return its blueprint data (modules, hotspots, dependencies). Returns the scan results as JSON without writing files.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
    },
    required: ['path'],
  },
};

export async function handleGenerateBlueprint(input: { path: string }) {
  let projectPath: string;
  try {
    projectPath = sanitizePath(input.path);
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

  try {
    const { ProjectScanner } = await import('@harness-engineering/core');

    const scanner = new ProjectScanner(projectPath);
    const data = await scanner.scan();

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data) }],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error generating blueprint: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
