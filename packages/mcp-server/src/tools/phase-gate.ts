import type { McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const checkPhaseGateDefinition = {
  name: 'check_phase_gate',
  description:
    'Verify implementation-to-spec mappings: checks that each implementation file has a corresponding spec document',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root directory' },
    },
    required: ['path'],
  },
};

export async function handleCheckPhaseGate(input: { path: string }): Promise<McpToolResponse> {
  try {
    const { runCheckPhaseGate } = await import('@harness-engineering/cli');
    const result = await runCheckPhaseGate({ cwd: sanitizePath(input.path) });
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
