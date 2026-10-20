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

/**
 * Thrown when a unit node carries no `loc` or `range`.
 *
 * `extractUnits` is a public export with a hard precondition: the AST must come
 * from a parse with `{ loc: true, range: true }`. Without this guard the
 * failure was an unguarded property read — `parse(src, { loc: false })` raised
 * `TypeError: Cannot read properties of undefined (reading 'start')` from
 * inside the walk — and the module relied on its one internal caller always
 * passing the right options.
 */
export class MissingNodeLocationError extends Error {
  /** The ESTree node type that was missing the field. */
  readonly nodeType: string;
  /** Which field was absent. */
  readonly field: 'loc' | 'range';

  constructor(nodeType: string, field: 'loc' | 'range') {
    super(
      `extractUnits requires an AST parsed with { loc: true, range: true }: ` +
        `a ${nodeType} node has no ${field}.`
    );
    this.name = 'MissingNodeLocationError';
    this.nodeType = nodeType;
    this.field = field;
  }
}

/**
 * ESTree node types that constitute a reportable unit, mapped to their kind.
 *
 * `ClassExpression` is included for symmetry with `ClassDeclaration`:
 * `const K = class { m() {} }` otherwise reported only `method:m`, silently
 * dropping the class itself. `StaticBlock` is deliberately absent — it has no
 * name and no call site, so it is not a unit anyone can extract or reuse.
 */
const UNIT_KINDS: Record<string, CloneUnitKind> = {
  FunctionDeclaration: 'function',
  FunctionExpression: 'function',
  ArrowFunctionExpression: 'function',
  MethodDefinition: 'method',
  ClassDeclaration: 'class',
  ClassExpression: 'class',
};

/**
 * Parent node types that name an otherwise-anonymous unit, and the key holding
 * that name. A declaration-less unit is overwhelmingly a named binding one hop
 * up — `const sendJSON = (res, status, body) => {…}` is not anonymous to any
 * human reading it.
 */
const NAMING_PARENTS: Record<string, 'id' | 'key'> = {
  VariableDeclarator: 'id',
  Property: 'key',
  PropertyDefinition: 'key',
};

/** The identifier or string-literal name carried by a node, if any. */
function nameOf(node: unknown): string | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const name = record['name'];
  if (typeof name === 'string') return name;
  // `{ 'send-json': function () {…} }` — a string-literal key still names it.
  const value = record['value'];
  if (typeof value === 'string') return value;
  return undefined;
}

/**
 * The declared name of a unit node, or `'<anon>'`.
 *
 * Consults `node.id` / `node.key` first, then the naming parent. Without the
 * parent hop, 17 of 192 reported members in this repo (8.9%) read `<anon>`,
 * including every member of the rank-525 class in
 * `packages/core/src/review/agents/typescript-strict-agent.ts` that the spec's
 * Evidence section cites by name. `CloneMember.unit` is the human-facing field
 * and the one `code-craft` binds against, so `<anon>` is a real cost.
 */
function unitName(node: Record<string, unknown>, parent: unknown): string {
  const own = nameOf(node['id']) ?? nameOf(node['key']);
  if (own !== undefined) return own;

  if (parent === null || typeof parent !== 'object') return '<anon>';
  const parentRecord = parent as Record<string, unknown>;
  const parentType = parentRecord['type'];
  if (typeof parentType !== 'string') return '<anon>';
  const namingKey = NAMING_PARENTS[parentType];
  if (namingKey === undefined) return '<anon>';
  // A computed key (`{ [k]: () => {…} }`) names the lookup, not the unit.
  if (namingKey === 'key' && parentRecord['computed'] === true) return '<anon>';
  // The unit must be the parent's VALUE, not, say, its own default initializer.
  const carried = namingKey === 'id' ? parentRecord['init'] : parentRecord['value'];
  if (carried !== node) return '<anon>';
  return nameOf(parentRecord[namingKey]) ?? '<anon>';
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
function toUnit(
  record: Record<string, unknown>,
  parent: unknown,
  consumed: Set<object>
): DupUnit | null {
  const type = record['type'];
  if (typeof type !== 'string') return null;
  const kind = UNIT_KINDS[type];
  if (kind === undefined) return null;

  if (type === 'MethodDefinition') {
    const value = record['value'];
    if (value !== null && typeof value === 'object') consumed.add(value);
  }

  const loc = record['loc'] as TSESTree.SourceLocation | undefined;
  const range = record['range'] as [number, number] | undefined;
  // Guarded, not asserted: both fields are optional on the estree types and a
  // caller is free to parse without them.
  if (loc === undefined) throw new MissingNodeLocationError(type, 'loc');
  if (range === undefined) throw new MissingNodeLocationError(type, 'range');
  return {
    kind,
    name: unitName(record, parent),
    startLine: loc.start.line,
    endLine: loc.end.line,
    range: [range[0], range[1]],
  };
}

/**
 * Keys on an ESTree node that never hold child nodes.
 *
 * `parent` is the load-bearing one: `@typescript-eslint/parser` and ESLint set
 * parent back-pointers, and following them makes the walk cyclic — a parsed
 * Program with parents linked overflowed the stack even at `--stack-size=2000`.
 * `tokens` and `comments` hang off `Program` only and held ~1400 entries for a
 * single mid-sized file, all traversed for nothing. The `seen` set below makes
 * termination unconditional; this list makes the walk cheap as well.
 */
const NON_CHILD_KEYS = new Set(['parent', 'tokens', 'comments', 'loc', 'range', 'type']);

/** Recurse the tree, collecting units in source order. */
function walk(
  node: unknown,
  parent: unknown,
  units: DupUnit[],
  consumed: Set<object>,
  seen: Set<object>
): void {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);

  const record = node as Record<string, unknown>;

  if (!consumed.has(node)) {
    const unit = toUnit(record, parent, consumed);
    if (unit !== null) units.push(unit);
  }

  // Recurse unconditionally — a consumed node is skipped as a unit, but units
  // nested inside its body are still reportable. The parent passed down is the
  // owning NODE, not the intermediate array, so `unitName` can read a binding
  // one hop up.
  for (const [key, value] of Object.entries(record)) {
    if (NON_CHILD_KEYS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, node, units, consumed, seen);
    } else {
      walk(value, node, units, consumed, seen);
    }
  }
}

/**
 * Extract every reportable unit from an ESTree program, in source order.
 *
 * @param ast - A program from `parse(src, { loc: true, range: true })`. Both
 *   options are required: a unit's line numbers and character range are its
 *   payload, so a node missing either raises
 *   {@link MissingNodeLocationError} rather than reading `undefined.start`.
 * @throws {MissingNodeLocationError} When the AST was parsed without `loc` or
 *   `range`.
 */
export function extractUnits(ast: TSESTree.Program): DupUnit[] {
  const units: DupUnit[] = [];
  walk(ast, null, units, new Set<object>(), new Set<object>());
  units.sort((a, b) => a.range[0] - b.range[0] || a.range[1] - b.range[1]);
  return units;
}
