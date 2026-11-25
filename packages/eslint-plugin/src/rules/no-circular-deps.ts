// src/rules/no-circular-deps.ts
//
// Reports a relative import that sits on an import cycle.
//
// How it sees cycles (each point fixes a way the rule used to be inert):
// - Specifiers are resolved to real files (exact path, TS-ESM `.js` -> `.ts`,
//   appended extensions, `index.*`), so `./b` meets the node for `b.ts`.
// - Files are keyed by their absolute path, so `packages/a/src/x.ts` and
//   `packages/b/src/x.ts` are different nodes.
// - Files not linted in this process are read from disk on demand, so a
//   single-file run (lint-staged, an editor) still closes a cycle.
// - Type-only imports/exports are erased at compile time and create no runtime
//   cycle, so they add no edge. Re-exports (`export … from`) do.
//
// The graph and every filesystem lookup are memoised for the life of the lint
// process. A long-lived process (an editor server) therefore keeps the disk
// view of files it has not re-linted; the linted file's own edges always come
// from its current AST.
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import * as path from 'path';
import {
  clearRelativeImportCaches,
  readRelativeImports,
  resolveRelativeImport,
  toGraphKey,
} from '../utils/relative-imports';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

/** Upper bound on files read from disk per lint process (bounds the work). */
const MAX_LAZY_LOADS = 20_000;

const EMPTY: ReadonlySet<string> = new Set();

// Module-level import graph: file key -> keys it imports at runtime.
const importGraph = new Map<string, Set<string>>();
/** Files whose out-edges are known (linted, or read from disk). */
const loaded = new Set<string>();
/** Files whose whole reachable closure has been loaded. */
const closed = new Set<string>();
let lazyLoads = 0;
let graphVersion = 0;
let components: { version: number; of: Map<string, number> } | null = null;

/**
 * Clear the import graph and the filesystem caches (for testing)
 */
export function clearImportGraph(): void {
  importGraph.clear();
  loaded.clear();
  closed.clear();
  lazyLoads = 0;
  graphVersion++;
  components = null;
  clearRelativeImportCaches();
}

/**
 * Add an edge to the import graph (exported for testing)
 */
export function addEdge(from: string, to: string): void {
  let deps = importGraph.get(from);
  if (!deps) {
    deps = new Set();
    importGraph.set(from, deps);
  }
  if (!deps.has(to)) {
    deps.add(to);
    graphVersion++;
  }
}

/** Replace a file's out-edges with the ones from its current AST. */
function setEdges(from: string, targets: Set<string>): void {
  loaded.add(from);
  const prev = importGraph.get(from);
  if (prev && prev.size === targets.size && [...targets].every((t) => prev.has(t))) return;
  importGraph.set(from, targets);
  graphVersion++;
}

/**
 * Load out-edges from disk for every file reachable from `start` that is not
 * in the graph yet. Only absolute keys are real files; others are left alone.
 */
function ensureClosure(start: string): void {
  if (closed.has(start)) return;
  const stack = [start];
  const seen = new Set<string>([start]);
  while (stack.length > 0) {
    const node = stack.pop()!;
    loadFromDisk(node);
    for (const dep of importGraph.get(node) ?? EMPTY) {
      if (seen.has(dep) || closed.has(dep)) continue;
      seen.add(dep);
      stack.push(dep);
    }
  }
  for (const node of seen) closed.add(node);
}

/** Read a not-yet-known file's out-edges from disk, within the work bound. */
function loadFromDisk(node: string): void {
  if (loaded.has(node) || !path.isAbsolute(node) || lazyLoads >= MAX_LAZY_LOADS) return;
  lazyLoads++;
  loaded.add(node);
  for (const dep of readRelativeImports(node)) addEdge(node, dep);
}

/** Iterative Tarjan: strongly connected component id per node. */
class Tarjan {
  private readonly index = new Map<string, number>();
  private readonly low = new Map<string, number>();
  private readonly onStack = new Set<string>();
  private readonly stack: string[] = [];
  private readonly work: Array<{ node: string; it: Iterator<string> }> = [];
  readonly of = new Map<string, number>();
  private next = 0;
  private id = 0;

  run(): Map<string, number> {
    for (const root of importGraph.keys()) {
      if (!this.index.has(root)) this.strongConnect(root);
    }
    return this.of;
  }

  private visit(n: string): void {
    this.index.set(n, this.next);
    this.low.set(n, this.next++);
    this.stack.push(n);
    this.onStack.add(n);
    this.work.push({ node: n, it: (importGraph.get(n) ?? EMPTY).values() });
  }

  private lower(n: string, value: number): void {
    this.low.set(n, Math.min(this.low.get(n)!, value));
  }

  private strongConnect(root: string): void {
    this.visit(root);
    while (this.work.length > 0) {
      const frame = this.work[this.work.length - 1]!;
      const step = frame.it.next();
      if (step.done) {
        this.finish(frame.node);
      } else if (!this.index.has(step.value)) {
        this.visit(step.value);
      } else if (this.onStack.has(step.value)) {
        this.lower(frame.node, this.index.get(step.value)!);
      }
    }
  }

  private finish(v: string): void {
    this.work.pop();
    const parent = this.work[this.work.length - 1];
    if (parent) this.lower(parent.node, this.low.get(v)!);
    if (this.low.get(v) !== this.index.get(v)) return;
    let w: string;
    do {
      w = this.stack.pop()!;
      this.onStack.delete(w);
      this.of.set(w, this.id);
    } while (w !== v);
    this.id++;
  }
}

/**
 * Strongly connected components of the graph, recomputed only when the graph
 * has changed. Edge from->to is on a cycle iff both ends share a component, so
 * a cycle-free import costs one map lookup rather than a full DFS of
 * everything it reaches.
 */
function componentOf(): Map<string, number> {
  if (components?.version === graphVersion) return components.of;
  const of = new Tarjan().run();
  components = { version: graphVersion, of };
  return of;
}

/**
 * Check if the edge from -> to closes a cycle.
 * Returns the cycle path [from, to, ..., from] if found, null otherwise.
 * Exported for testing
 */
export function detectCycle(from: string, to: string): string[] | null {
  ensureClosure(to);
  // Shortest path to -> from (BFS) gives the most readable cycle.
  const parent = new Map<string, string | null>([[to, null]]);
  const queue = [to];
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!;
    if (current === from) {
      const back: string[] = [];
      for (let n: string | null = current; n !== null; n = parent.get(n) ?? null) back.push(n);
      return [from, ...back.reverse()];
    }
    for (const dep of importGraph.get(current) ?? EMPTY) {
      if (!parent.has(dep)) {
        parent.set(dep, current);
        queue.push(dep);
      }
    }
  }
  return null;
}

type ModuleNode =
  | TSESTree.ImportDeclaration
  | TSESTree.ExportNamedDeclaration
  | TSESTree.ExportAllDeclaration
  | TSESTree.TSImportEqualsDeclaration;

/** `import … from` is runtime unless `import type` or `import { type A, type B }`. */
function importSpecifier(node: TSESTree.ImportDeclaration): string | null {
  if (node.importKind === 'type') return null;
  const typeOnlyNamed =
    node.specifiers.length > 0 &&
    node.specifiers.every((s) => s.type === 'ImportSpecifier' && s.importKind === 'type');
  return typeOnlyNamed ? null : node.source.value;
}

/** `export … from` is runtime unless `export type` or every specifier is `type`. */
function exportNamedSpecifier(node: TSESTree.ExportNamedDeclaration): string | null {
  if (!node.source || node.exportKind === 'type') return null;
  const typeOnlyNamed =
    node.specifiers.length > 0 && node.specifiers.every((s) => s.exportKind === 'type');
  return typeOnlyNamed ? null : node.source.value;
}

/** `import x = require('./y')` is runtime unless `import type x = require(…)`. */
function importEqualsSpecifier(node: TSESTree.TSImportEqualsDeclaration): string | null {
  const ref = node.moduleReference;
  if (node.importKind === 'type' || ref.type !== 'TSExternalModuleReference') return null;
  return typeof ref.expression.value === 'string' ? ref.expression.value : null;
}

/** The specifier of a statement that creates a runtime edge, else null. */
function runtimeSpecifier(node: ModuleNode): string | null {
  switch (node.type) {
    case 'ImportDeclaration':
      return importSpecifier(node);
    case 'ExportNamedDeclaration':
      return exportNamedSpecifier(node);
    case 'ExportAllDeclaration':
      return node.exportKind === 'type' ? null : node.source.value;
    case 'TSImportEqualsDeclaration':
      return importEqualsSpecifier(node);
  }
  return null;
}

type MessageIds = 'circularDep';
type RuleContext = Parameters<ReturnType<typeof createRule<[], MessageIds>>['create']>[0];
type Edge = { node: ModuleNode; target: string };

/** Record the linted file's edges, then report each one that lies on a cycle. */
function reportCycles(context: RuleContext, currentFile: string, edges: Edge[]): void {
  setEdges(currentFile, new Set(edges.map((e) => e.target)));
  if (edges.length === 0) return;
  for (const { target } of edges) ensureClosure(target);
  const of = componentOf();
  const self = of.get(currentFile);
  const display = (key: string): string =>
    path.relative(context.cwd, key).replace(/\\/g, '/') || path.basename(key);
  for (const { node, target } of edges) {
    const onCycle = target === currentFile || of.get(target) === self;
    const cycle = onCycle ? detectCycle(currentFile, target) : null;
    if (!cycle) continue;
    context.report({
      node,
      messageId: 'circularDep',
      data: { cycle: cycle.map(display).join(' → ') },
    });
  }
}

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
    const currentFile = toGraphKey(context.filename);
    const edges: Edge[] = [];

    const collect = (node: ModuleNode): void => {
      const spec = runtimeSpecifier(node);
      const target = spec === null ? null : resolveRelativeImport(context.filename, spec);
      if (target) edges.push({ node, target });
    };

    return {
      ImportDeclaration: collect,
      ExportNamedDeclaration: collect,
      ExportAllDeclaration: collect,
      TSImportEqualsDeclaration: collect,
      'Program:exit'() {
        reportCycles(context, currentFile, edges);
      },
    };
  },
});
