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
 * Build the unit for `record`, or `null` when the node is not a reportable unit.
 *
 * A `MethodDefinition`'s `.value` is itself a `FunctionExpression`, so a naive
 * walk reports one method three times — as the enclosing class, as the method,
 * and as an anonymous function — two of which collide on the
 * `${file}:${startLine}` key `CloneIndex.byMember` uses. The method therefore
 * consumes its own value node here. A class-field arrow (`handler = (x) => …`)
 * is a `PropertyDefinition` value and is deliberately NOT consumed: it is a
 * real unit with no method wrapper of its own.
 */
function toUnit(record: Record<string, unknown>, consumed: Set<object>): DupUnit | null {
  const type = record['type'];
  if (typeof type !== 'string') return null;
  const kind = UNIT_KINDS[type];
  if (kind === undefined) return null;

  if (type === 'MethodDefinition') {
    const value = record['value'];
    if (value !== null && typeof value === 'object') consumed.add(value);
  }

  const loc = record['loc'] as TSESTree.SourceLocation;
  const range = record['range'] as [number, number];
  return {
    kind,
    name: unitName(record),
    startLine: loc.start.line,
    endLine: loc.end.line,
    range: [range[0], range[1]],
  };
}

/** Recurse the tree, collecting units in source order. */
function walk(node: unknown, units: DupUnit[], consumed: Set<object>): void {
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;

  if (!consumed.has(node)) {
    const unit = toUnit(record, consumed);
    if (unit !== null) units.push(unit);
  }

  // Recurse unconditionally — a consumed node is skipped as a unit, but units
  // nested inside its body are still reportable.
  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, units, consumed);
    } else {
      walk(value, units, consumed);
    }
  }
}

/** Extract every reportable unit from an ESTree program, in source order. */
export function extractUnits(ast: TSESTree.Program): DupUnit[] {
  const units: DupUnit[] = [];
  walk(ast, units, new Set<object>());
  units.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
  return units;
}
