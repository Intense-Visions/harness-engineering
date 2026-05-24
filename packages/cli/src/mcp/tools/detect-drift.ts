/**
 * MCP tool: `mcp__harness__detect_drift`.
 *
 * Wraps the detect-design-drift skill (design-pipeline sub-project #1,
 * detect half). Composed by harness check-design as the 3rd verifier.
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Integration Points → MCP tool).
 */

import {
  runDetectDrift,
  type DetectDriftInput,
  type DetectDriftOutput,
} from '../../drift/index.js';

interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const detectDriftDefinition = {
  name: 'detect_drift',
  description:
    'Detect design-system drift in source: hardcoded values where tokens exist (token bypass) ' +
    'and raw HTML primitives where a registered design-system component exists (primitive adoption). ' +
    'Composes with harness check-design as the 3rd verifier alongside audit-anatomy and design-craft.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Project root path' },
      mode: {
        type: 'string',
        enum: ['fast', 'full'],
        description: 'Both modes equivalent in v1 (no slow patterns yet).',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional explicit file list to scope the scan.',
      },
      designStrictness: {
        type: 'string',
        enum: ['strict', 'standard', 'permissive'],
        description: 'Overrides design.strictness from harness.config.json.',
      },
      rules: {
        type: 'object',
        description: 'Per-rule enable flags.',
        properties: {
          tokenBypass: { type: 'boolean', description: 'Default true' },
          primitiveAdoption: { type: 'boolean', description: 'Default true' },
        },
      },
    },
    required: ['path'],
  },
};

export async function handleDetectDrift(input: DetectDriftInput): Promise<ToolResponse> {
  if (typeof input?.path !== 'string' || input.path.length === 0) {
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: 'detect_drift: `path` is required' }) },
      ],
      isError: true,
    };
  }
  try {
    const result: DetectDriftOutput = await runDetectDrift(input);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        { type: 'text', text: JSON.stringify({ error: `detect_drift failed: ${message}` }) },
      ],
      isError: true,
    };
  }
}

// Re-export the entry point so check-design can import directly without
// routing through MCP wrapping.
export { runDetectDrift } from '../../drift/index.js';
export type { DetectDriftInput, DetectDriftOutput, DetectDriftMode } from '../../drift/index.js';
