// packages/cli/src/mcp/tools/insights-summary.ts
//
// Hermes Phase 1 — MCP `insights_summary` tool.
// Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D5, D6)
import { Ok, Err } from '@harness-engineering/core';
import { INSIGHTS_KEYS, type InsightsKey } from '@harness-engineering/types';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const insightsSummaryDefinition = {
  name: 'insights_summary',
  description:
    'Composite report combining health, entropy, decay, attention, and impact (Hermes Phase 1).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      skip: {
        type: 'array',
        items: { type: 'string', enum: INSIGHTS_KEYS as unknown as string[] },
        description: 'Top-level keys to skip.',
      },
    },
    required: ['path'],
  },
};

export async function handleInsightsSummary(
  input: Record<string, unknown>
): Promise<McpToolResponse> {
  try {
    const pathInput = typeof input.path === 'string' ? input.path : '';
    const projectPath = sanitizePath(pathInput);
    const skip = Array.isArray(input.skip)
      ? (input.skip.filter(
          (k): k is InsightsKey =>
            typeof k === 'string' && (INSIGHTS_KEYS as readonly string[]).includes(k)
        ) as InsightsKey[])
      : undefined;
    const { composeInsights } = await import('@harness-engineering/core');
    const report = await composeInsights(projectPath, {
      ...(skip && skip.length > 0 && { skip }),
    });
    return resultToMcpResponse(Ok(report));
  } catch (e) {
    return resultToMcpResponse(Err({ message: e instanceof Error ? e.message : String(e) }));
  }
}
