// packages/cli/src/mcp/tools/search-sessions.ts
//
// Hermes Phase 1 — MCP `search_sessions` tool.
// Spec: docs/changes/hermes-phase-1-session-search/proposal.md (D6)
import { Ok, Err } from '@harness-engineering/core';
import type { IndexedFileKind } from '@harness-engineering/types';
import { INDEXED_FILE_KINDS } from '@harness-engineering/types';
import { resultToMcpResponse, type McpToolResponse } from '../utils/result-adapter.js';
import { sanitizePath } from '../utils/sanitize-path.js';

export const searchSessionsDefinition = {
  name: 'search_sessions',
  description: 'Full-text search over archived + live session content (Hermes Phase 1, FTS5/BM25).',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Path to project root' },
      query: { type: 'string', description: 'FTS5 query (bare words AND-joined)' },
      limit: { type: 'number', description: 'Max results (default 20)' },
      archivedOnly: {
        type: 'boolean',
        description: 'Only search archived sessions (skip live).',
      },
      fileKinds: {
        type: 'array',
        items: { type: 'string', enum: INDEXED_FILE_KINDS as unknown as string[] },
        description: 'Subset of file kinds to search.',
      },
    },
    required: ['path', 'query'],
  },
};

export async function handleSearchSessions(
  input: Record<string, unknown>
): Promise<McpToolResponse> {
  try {
    const pathInput = typeof input.path === 'string' ? input.path : '';
    const projectPath = sanitizePath(pathInput);
    const query = typeof input.query === 'string' ? input.query : '';
    if (!query || query.trim() === '') {
      return resultToMcpResponse(Err({ message: 'query is required' }));
    }
    const limit = typeof input.limit === 'number' ? input.limit : undefined;
    const archivedOnly = input.archivedOnly === true;
    const fileKinds = Array.isArray(input.fileKinds)
      ? (input.fileKinds.filter(
          (k): k is IndexedFileKind =>
            typeof k === 'string' && (INDEXED_FILE_KINDS as readonly string[]).includes(k)
        ) as IndexedFileKind[])
      : undefined;

    const orchestrator = await import('@harness-engineering/orchestrator');
    const idx = orchestrator.openSearchIndex(projectPath);
    try {
      const result = idx.search(query, {
        ...(limit !== undefined && { limit }),
        ...(archivedOnly && { archivedOnly }),
        ...(fileKinds && fileKinds.length > 0 && { fileKinds }),
      });
      return resultToMcpResponse(Ok(result));
    } finally {
      idx.close();
    }
  } catch (e) {
    return resultToMcpResponse(Err({ message: e instanceof Error ? e.message : String(e) }));
  }
}
