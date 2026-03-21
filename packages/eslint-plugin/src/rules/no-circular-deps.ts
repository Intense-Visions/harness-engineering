// src/rules/no-circular-deps.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

// Module-level import graph (persists per lint run)
const importGraph = new Map<string, Set<string>>();

/**
 * Clear the import graph (for testing)
 */
export function clearImportGraph(): void {
  importGraph.clear();
}

/**
 * Add an edge to the import graph (exported for testing)
 */
export function addEdge(from: string, to: string): void {
  if (!importGraph.has(from)) {
    importGraph.set(from, new Set());
  }
  importGraph.get(from)!.add(to);
}

/**
 * Check if adding edge from -> to creates a cycle
 * Returns the cycle path if found, null otherwise
 * Exported for testing
 */
export function detectCycle(from: string, to: string): string[] | null {
  // DFS from 'to' back to 'from'
  const visited = new Set<string>();
  const cyclePath: string[] = [to];

  function dfs(current: string): boolean {
    if (current === from) {
      return true; // Found cycle
    }
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);

    const deps = importGraph.get(current);
    if (deps) {
      for (const dep of deps) {
        cyclePath.push(dep);
        if (dfs(dep)) {
          return true;
        }
        cyclePath.pop();
      }
    }
    return false;
  }

  if (dfs(to)) {
    return [from, ...cyclePath];
  }
  return null;
}

/**
 * Normalize file path to project-relative
 */
function normalizePath(filePath: string): string {
  // Normalize separators to forward slash for cross-platform consistency
  const normalized = filePath.replace(/\\/g, '/');
  // Extract path from /project/src/... or similar
  const srcIndex = normalized.indexOf('/src/'); // eslint-disable-line @harness-engineering/no-hardcoded-path-separator -- platform-safe
  if (srcIndex !== -1) {
    return normalized.slice(srcIndex + 1);
  }
  return path.basename(filePath);
}

type MessageIds = 'circularDep';

export default createRule<[], MessageIds>({
  name: 'no-circular-deps',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect circular import dependencies',
    },
    messages: {
      circularDep: 'Circular dependency detected: {{cycle}}',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const currentFile = normalizePath(context.filename);

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;

        // Skip external imports
        if (!importPath.startsWith('.')) {
          return;
        }

        // Resolve import to normalized path
        const importingDir = path.dirname(context.filename);
        const resolvedPath = path.resolve(importingDir, importPath);
        const normalizedImport = normalizePath(resolvedPath);

        // Check for cycle before adding edge
        const cycle = detectCycle(currentFile, normalizedImport);
        if (cycle) {
          context.report({
            node,
            messageId: 'circularDep',
            data: {
              cycle: cycle.map((f) => path.basename(f)).join(' → '),
            },
          });
        }

        // Add edge to graph
        addEdge(currentFile, normalizedImport);
      },
    };
  },
});
