import type { GraphNode } from '../types.js';

/** Node type sets for grouping impact results into categories. */
export const TEST_TYPES: ReadonlySet<string> = new Set(['test_result']);
export const DOC_TYPES: ReadonlySet<string> = new Set(['adr', 'decision', 'document', 'learning']);
export const CODE_TYPES: ReadonlySet<string> = new Set([
  'file',
  'module',
  'class',
  'interface',
  'function',
  'method',
  'variable',
]);

export type NodeCategory = 'tests' | 'docs' | 'code' | 'other';

/** Classify a graph node into an impact category. */
export function classifyNodeCategory(node: GraphNode): NodeCategory {
  if (TEST_TYPES.has(node.type)) return 'tests';
  if (DOC_TYPES.has(node.type)) return 'docs';
  if (CODE_TYPES.has(node.type)) return 'code';
  return 'other';
}

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
    const category = classifyNodeCategory(node);
    if (category === 'tests') tests.push(node);
    else if (category === 'docs') docs.push(node);
    else if (category === 'code') code.push(node);
    else other.push(node);
  }

  return { tests, docs, code, other };
}
