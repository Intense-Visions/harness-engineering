export type McpContentAnnotations = {
  audience?: Array<'user' | 'assistant'>;
  priority?: number;
};

export type McpContentItem = {
  type: 'text';
  text: string;
  annotations?: McpContentAnnotations;
};

export type McpResponse = { content: McpContentItem[]; isError?: boolean };

export function mcpError(text: string): McpResponse {
  return { content: [{ type: 'text' as const, text }], isError: true };
}
