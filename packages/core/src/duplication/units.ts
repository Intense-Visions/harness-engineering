import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * The granularity at which duplication is reported (spec decision D2):
 * whole functions, methods, and classes — never sub-unit windows.
 */
export type CloneUnitKind = 'function' | 'method' | 'class';

/** A single fingerprintable source unit, located in its file. */
export interface DupUnit {
  kind: CloneUnitKind;
  /** The unit's declared identifier, or `'<anon>'` when it has none. */
  name: string;
  startLine: number;
  endLine: number;
  /** `[start, end]` character offsets, used to select the unit's tokens. */
  range: [number, number];
}

/** ESTree node types that constitute a reportable unit, mapped to their kind. */
const UNIT_KINDS: Record<string, CloneUnitKind> = {
  FunctionDeclaration: 'function',
  FunctionExpression: 'function',
  ArrowFunctionExpression: 'function',
  MethodDefinition: 'method',
  ClassDeclaration: 'class',
};

/** The declared name of a unit node, or `'<anon>'`. */
function unitName(node: Record<string, unknown>): string {
  const id = node['id'] as { name?: string } | null | undefined;
  if (id?.name !== undefined) return id.name;
  const key = node['key'] as { name?: string } | null | undefined;
  if (key?.name !== undefined) return key.name;
  return '<anon>';
}

/**
 * Extract every reportable unit from an ESTree program, in source order.
 *
 * A `MethodDefinition`'s `.value` is itself a `FunctionExpression`, so a naive
 * walk reports one method three times — as the enclosing class, as the method,
 * and as an anonymous function — two of which collide on the
 * `${file}:${startLine}` key `CloneIndex.byMember` uses. The method therefore
 * consumes its own value node. A class-field arrow (`handler = (x) => …`) is a
 * `PropertyDefinition` value and is deliberately NOT consumed: it is a real
 * unit with no method wrapper of its own.
 */
export function extractUnits(ast: TSESTree.Program): DupUnit[] {
  const units: DupUnit[] = [];
  const consumed = new Set<object>();

  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if (typeof record['type'] === 'string') {
      const kind = UNIT_KINDS[record['type'] as string];
      if (kind !== undefined && !consumed.has(node)) {
        if (record['type'] === 'MethodDefinition') {
          const value = record['value'];
          if (value !== null && typeof value === 'object') consumed.add(value);
        }
        const loc = record['loc'] as TSESTree.SourceLocation;
        const range = record['range'] as [number, number];
        units.push({
          kind,
          name: unitName(record),
          startLine: loc.start.line,
          endLine: loc.end.line,
          range: [range[0], range[1]],
        });
      }
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
      } else {
        walk(value);
      }
    }
  };

  walk(ast);
  units.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
  return units;
}
