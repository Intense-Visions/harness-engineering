export type McpResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

export function mcpError(text: string): McpResponse {
  return { content: [{ type: 'text' as const, text }], isError: true };
}
