// packages/cli/src/mcp/tools/summarize-session.ts
//
// Hermes Phase 1 — MCP `summarize_session` tool.
// Manually re-summarise an already-archived session by id.
// Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D6)
import * as fs from 'fs';
import * as path from 'path';
import { Ok, Err } from '@harness-engineering/core';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const summarizeSessionDefinition = {
  name: 'summarize_session',
  description:
    'Generate or regenerate the LLM `llm-summary.md` for an archived session (Hermes Phase 1).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      sessionId: {
        type: 'string',
        description:
          'Archived session id (basename of the directory inside .harness/archive/sessions/)',
      },
      force: {
        type: 'boolean',
        description:
          'If true, overwrite an existing llm-summary.md. Default: false (no-op when present).',
      },
    },
    required: ['path', 'sessionId'],
  },
};

async function resolveAnthropicProvider(): Promise<unknown> {
  try {
    const intelligence = (await import('@harness-engineering/intelligence')) as Record<
      string,
      unknown
    >;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return null;
    const Provider = intelligence.AnthropicAnalysisProvider as
      | (new (opts: { apiKey: string }) => unknown)
      | undefined;
    if (typeof Provider !== 'function') return null;
    return new Provider({ apiKey });
  } catch {
    return null;
  }
}

export async function handleSummarizeSession(
  input: Record<string, unknown>
): Promise<McpToolResponse> {
  try {
    const pathInput = typeof input.path === 'string' ? input.path : '';
    const projectPath = sanitizePath(pathInput);
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : '';
    if (!sessionId) {
      return resultToMcpResponse(Err({ message: 'sessionId is required' }));
    }
    const force = input.force === true;

    const archiveDir = path.join(projectPath, '.harness', 'archive', 'sessions', sessionId);
    if (!fs.existsSync(archiveDir)) {
      return resultToMcpResponse(Err({ message: `archived session not found: ${sessionId}` }));
    }

    const llmSummary = path.join(archiveDir, 'llm-summary.md');
    if (fs.existsSync(llmSummary) && !force) {
      return resultToMcpResponse(
        Ok({
          sessionId,
          status: 'exists',
          filePath: llmSummary,
        })
      );
    }

    const provider = await resolveAnthropicProvider();
    if (!provider) {
      return resultToMcpResponse(
        Err({
          message:
            'No analysis provider configured. Set ANTHROPIC_API_KEY to enable hermes summarization.',
        })
      );
    }

    const { summarizeArchivedSession } = await import('@harness-engineering/orchestrator');
    const result = await summarizeArchivedSession({
      archiveDir,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provider: provider as any,
    });
    if (!result.ok) {
      return resultToMcpResponse(Err({ message: result.error.message }));
    }
    return resultToMcpResponse(
      Ok({
        sessionId,
        status: 'wrote',
        filePath: result.value.filePath,
        meta: result.value.meta,
      })
    );
  } catch (e) {
    return resultToMcpResponse(Err({ message: e instanceof Error ? e.message : String(e) }));
  }
}
