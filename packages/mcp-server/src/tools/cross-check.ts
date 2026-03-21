import * as path from 'path';
import type { McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const validateCrossCheckDefinition = {
  name: 'validate_cross_check',
  description:
    'Validate plan-to-implementation coverage: checks that specs have plans and plans have implementations, detects staleness',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
      specsDir: {
        type: 'string',
        description: 'Specs directory relative to project root (default: docs/specs)',
      },
      plansDir: {
        type: 'string',
        description: 'Plans directory relative to project root (default: docs/plans)',
      },
    },
    required: ['path'],
  },
};

export async function handleValidateCrossCheck(input: {
  path: string;
  specsDir?: string;
  plansDir?: string;
}): Promise<McpToolResponse> {
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
    const { runCrossCheck } = await import('@harness-engineering/cli');

    const specsDir = path.resolve(projectPath, input.specsDir ?? 'docs/specs');
    if (!specsDir.startsWith(projectPath)) {
      return {
        content: [{ type: 'text' as const, text: 'Error: specsDir escapes project root' }],
        isError: true,
      };
    }
    const plansDir = path.resolve(projectPath, input.plansDir ?? 'docs/plans');
    if (!plansDir.startsWith(projectPath)) {
      return {
        content: [{ type: 'text' as const, text: 'Error: plansDir escapes project root' }],
        isError: true,
      };
    }

    const result = await runCrossCheck({
      projectPath,
      specsDir,
      plansDir,
    });
    if (result.ok) {
      return { content: [{ type: 'text' as const, text: JSON.stringify(result.value) }] };
    }
    return { content: [{ type: 'text' as const, text: result.error.message }], isError: true };
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
