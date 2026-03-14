// packages/mcp-server/src/utils/result-adapter.ts
import type { Result } from '@harness-engineering/core';

export interface McpToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function resultToMcpResponse(result: Result<unknown, { message: string }>): McpToolResponse {
  if (result.ok) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.value) }],
    };
  }
  return {
    content: [{ type: 'text', text: result.error.message }],
    isError: true,
  };
}
