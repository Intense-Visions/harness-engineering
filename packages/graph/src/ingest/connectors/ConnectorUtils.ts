import type { GraphStore } from '../../store/GraphStore.js';
import type { EdgeType } from '../../types.js';

const CODE_NODE_TYPES = ['file', 'function', 'class', 'method', 'interface', 'variable'] as const;

/**
 * Sanitize text from external sources (Jira, Slack, Confluence, CI) before
 * storing in graph nodes. These nodes may be returned to LLMs via MCP tools,
 * so we strip patterns commonly used in prompt injection attacks.
 */
export function sanitizeExternalText(text: string, maxLength = 2000): string {
  let sanitized = text
    // Strip XML/HTML-like instruction tags that could be interpreted as system prompts
    .replace(
      /<\/?(?:system|instruction|prompt|role|context|tool_call|function_call|assistant|human|user)[^>]*>/gi,
      ''
    )
    // Strip markdown-style system prompt markers (including trailing space)
    .replace(/^#{1,3}\s*(?:system|instruction|prompt)\s*[:：]\s*/gim, '')
    // Strip common injection prefixes
    .replace(
      /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions?|prompts?|context)/gi,
      '[filtered]'
    )
    // Strip "you are now" re-roling attempts (only when followed by AI/agent role words)
    .replace(
      /you\s+are\s+now\s+(?:a\s+)?(?:helpful\s+)?(?:an?\s+)?(?:assistant|system|ai|bot|agent|tool)\b/gi,
      '[filtered]'
    );

  // Truncate to prevent context stuffing
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '…';
  }

  return sanitized;
}

export function linkToCode(
  store: GraphStore,
  content: string,
  sourceNodeId: string,
  edgeType: EdgeType,
  options?: { checkPaths?: boolean }
): number {
  let edgesCreated = 0;
  for (const type of CODE_NODE_TYPES) {
    const nodes = store.findNodes({ type });
    for (const node of nodes) {
      if (node.name.length < 3) continue;
      const escaped = node.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
      let matched = pattern.test(content);
      if (!matched && options?.checkPaths && node.path) {
        matched = content.includes(node.path);
      }
      if (matched) {
        store.addEdge({ from: sourceNodeId, to: node.id, type: edgeType });
        edgesCreated++;
      }
    }
  }
  return edgesCreated;
}
