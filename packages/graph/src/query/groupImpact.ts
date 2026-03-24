import type { GraphNode } from '../types.js';

/** Node type sets for grouping impact results into categories. */
const TEST_TYPES: ReadonlySet<string> = new Set(['test_result']);
const DOC_TYPES: ReadonlySet<string> = new Set(['adr', 'decision', 'document', 'learning']);
const CODE_TYPES: ReadonlySet<string> = new Set([
  'file',
  'module',
  'class',
  'interface',
  'function',
  'method',
  'variable',
]);

export interface ImpactGroups {
  readonly tests: readonly GraphNode[];
  readonly docs: readonly GraphNode[];
  readonly code: readonly GraphNode[];
  readonly other: readonly GraphNode[];
}

/**
 * Group graph nodes into impact categories (tests, docs, code, other).
 * Excludes the root node from the results.
 *
 * Shared by both the NLQ orchestrator and the MCP get_impact handler.
 */
export function groupNodesByImpact(nodes: readonly GraphNode[], excludeId?: string): ImpactGroups {
  const tests: GraphNode[] = [];
  const docs: GraphNode[] = [];
  const code: GraphNode[] = [];
  const other: GraphNode[] = [];

  for (const node of nodes) {
    if (excludeId && node.id === excludeId) continue;
    if (TEST_TYPES.has(node.type)) {
      tests.push(node);
    } else if (DOC_TYPES.has(node.type)) {
      docs.push(node);
    } else if (CODE_TYPES.has(node.type)) {
      code.push(node);
    } else {
      other.push(node);
    }
  }

  return { tests, docs, code, other };
}
