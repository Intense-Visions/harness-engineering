import { posix as pathPosix } from 'node:path';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * The module-identity key for one import, and the offsets at which the local
 * bindings it introduces are USED in a qualifying position.
 *
 * `byKey` maps a module key to the VALUE binding names that module introduces
 * into the file; `positions` maps each of those names to the ascending start
 * offsets of its qualifying uses — a call callee, a method-call receiver, or a
 * JSX element name (see {@link collectFileImports}). Both are built in one pass
 * per file so that asking "does THIS unit use an import" costs no further
 * traversal — the detector extracts ~13,400 units over ~1.6M tokens at this
 * repository's scope, so a per-unit rescan is not an option (`normalizeTokens`
 * binary-searches for the same reason).
 *
 * A binding with no qualifying use has NO entry in `positions` though it is
 * listed in `byKey`: `byKey` answers "what did this file import", `positions`
 * answers "where is it called". The gap between them is this module's subject.
 */
export interface FileImports {
  byKey: ReadonlyMap<string, readonly string[]>;
  positions: ReadonlyMap<string, readonly number[]>;
}

/** Specifier extensions stripped so `./a.js`, `./a.ts` and `./a` share one key. */
const SPECIFIER_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/**
 * Resolve one import specifier to a repo-relative, extensionless module key —
 * or `null` when it is not a first-party module of this project.
 *
 * Resolution is a CORRECTNESS requirement, not hygiene. Measured over the 96
 * clone classes this repository reports: intersecting RAW specifier strings
 * labels 89 of them (92.7%) — and labels them WRONG, because
 * `../catalog/rubrics/index.js` is the same string in six craft packages while
 * naming six different files. Keyed on identity instead, that same class
 * reports exactly one shared module.
 *
 * `null` for a BARE specifier (`node:fs`, `commander`,
 * `@harness-engineering/core`): nobody extracts a wrapper into a Node builtin
 * or an installed dependency, and "every member calls `node:path`" labelled 17
 * further classes that are plain duplicates. `null` also for a relative
 * specifier that escapes `rootDir`, which cannot be a module of the project
 * being scanned and whose key would contradict the repo-relative contract
 * every other path in this module keeps.
 *
 * FS-FREE, and the cost of that is NAMED rather than waved away. An earlier
 * revision claimed the keys "are only ever COMPARED, so proving the file exists
 * buys nothing". Wrong in the general case: extension stripping is not module
 * resolution, so two specifiers naming ONE file can land on two keys —
 * `'./sub'` keys as `src/a/sub` while `'./sub/index.js'` keys as
 * `src/a/sub/index`, and a class split across the two spellings is not
 * labelled. Measured repo-wide at HEAD — 2,299 discovered files, 5,860 relative
 * specifiers, 1,829 distinct resolved targets — **6 targets are reached under
 * two keys**, and the cost in labels today is **zero**: no clone class has
 * members on both sides of a split. Inert, and recorded so neither reads as a
 * bug: `'./types.d.ts'` keys as `…/types.d` (one extension stripped, and
 * `.d.ts` is ineligible to scan anyway), `.json`/`.css` specifiers keep their
 * extension (correct — not the same module as a `.ts` neighbour), and keys are
 * CASE-SENSITIVE, so `'./Row.js'` and `'./row.js'` are two keys on a
 * case-insensitive filesystem. The fix is real resolution (an `existsSync` per
 * candidate extension per import, plus a `package.json` `exports` read); if a
 * project ever loses a label to a split key, that is the trade to revisit.
 */
export function moduleKey(fromRelPath: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const joined = pathPosix.normalize(pathPosix.join(pathPosix.dirname(fromRelPath), specifier));
  if (joined === '..' || joined.startsWith('../')) return null;
  return joined.replace(SPECIFIER_EXTENSION, '');
}

/**
 * Collect one file's first-party value imports and the offsets at which they are
 * USED in a qualifying position.
 *
 * TYPE-ONLY imports are excluded, per declaration (`import type { X } from`)
 * AND per specifier (`import { type X, y } from`) — two of this repository's
 * classes hinge on the per-specifier arm alone. The exclusion is spec
 * criterion 2's own false-positive clause, not a convenience: a shared
 * `import type` IS the "structurally forced by an interface contract" case
 * that criterion rejects, while a shared helper the duplicated bodies CALL is
 * the half-done extraction decision D8 was earned by.
 *
 * A side-effect-only import (`import './polyfill.js'`) introduces no binding,
 * so it can never be referenced and is dropped here rather than carried as an
 * un-referenceable key.
 *
 * ## A qualifying USE, and why it is not "the name appears"
 *
 * An earlier revision scanned `program.tokens` for Identifier/JSXIdentifier
 * tokens whose TEXT equalled an import local. That is a token-spelling match,
 * not a binding reference, and it made the published claim FALSE: three live
 * classes (`printResult` and two `resolveOutputMode` classes) were labelled
 * `partial-extraction` with `sharedImport` naming
 * `packages/cli/src/output/formatter`, because every member body mentions the
 * `OutputMode` CONSTANT — while that module exports no `resolveOutputMode`, so
 * the promised "delete the wrapper, import the helper" repair had nothing to
 * import. Sharing a project-local constant is the first-party analogue of the
 * "every member calls `node:path`" case {@link moduleKey} already rejects.
 *
 * A use therefore counts only where the binding is EXERCISED, in one of three
 * positions:
 *
 * 1. **A call callee** — `extract(x)`, `new Formatter(mode)`, `@log()`.
 * 2. **A method-call receiver** — `fmt.format(x)`, `ns.helpers.render(x)`: the
 *    leftmost identifier of a member chain that is itself a callee. `a['b']()`
 *    counts; the receiver is `a` either way.
 * 3. **A JSX element name** — `<Row />`, `<Ui.Row />`: the leftmost
 *    `JSXIdentifier` of a `JSXOpeningElement`'s name. Load-bearing, because
 *    `index.ts` parses `.tsx`/`.jsx`/`.js`/`.mjs`/`.cjs` with `jsx: true` and a
 *    component referenced only as an element appears in no other position.
 *
 * Measured over the 96 Scope C classes this moves the label count **10 -> 7**,
 * dropping exactly the three classes named above. It also removes, by
 * construction rather than by a second filter, four of the five mislabel shapes
 * the token scan admitted: a member PROPERTY spelled like the import
 * (`item.extract()` — only the receiver is recorded), a non-computed object or
 * property KEY (`{ extract: item }`, `class A { extract() {} }`), and a value
 * import used only as a TYPE (`mode: OutputModeType`).
 *
 * The fifth shape is a local binding that SHADOWS the import
 * (`function f(extract) { return extract(1); }`), where the callee is a
 * qualifying use of a different binding. Deciding that correctly is scope
 * analysis and this module has no scope manager (adding
 * `@typescript-eslint/scope-manager` to a published package's runtime
 * dependencies is a bigger decision than this predicate), so it does the
 * conservative thing: a name ALSO introduced as a binding anywhere in the file —
 * parameter, destructured parameter, variable declarator, function or class id,
 * `catch` parameter — is dropped from `byKey`, and its key with it. The residual
 * is a false NEGATIVE, never a false positive, and it is measured rather than
 * hoped: over Scope C the rule costs **0 of the 7** labels.
 *
 * Deliberately NOT uses, so the omissions do not read as oversights: a callback
 * position (`rows.map(extract)`), a tagged template, a bare property read
 * (`OutputMode.JSON` — the case this exists to reject), and `export { extract }`.
 * Each widens the predicate past "the duplicated bodies CALL a shared helper",
 * which is the sentence D8 was earned by.
 */
export function collectFileImports(program: TSESTree.Program, relPath: string): FileImports {
  const byKey = new Map<string, string[]>();
  const locals = new Set<string>();
  for (const node of program.body) {
    const imported = valueImportOf(node, relPath);
    if (imported === null) continue;
    const existing = byKey.get(imported.key);
    if (existing === undefined) byKey.set(imported.key, [...imported.names]);
    else existing.push(...imported.names);
    for (const name of imported.names) locals.add(name);
  }
  const scan = scanUses(program, locals);
  return { byKey: withoutShadowed(byKey, scan.shadowed), positions: scan.positions };
}

/**
 * One top-level statement's first-party module key and the VALUE binding names
 * it introduces — or `null` when it introduces none.
 *
 * Split out of {@link collectFileImports} to keep both functions inside this
 * repository's cyclomatic-complexity thresholds (the combined form measured
 * 17 against a bar of 15, and the pre-commit hook's bar is 10). The three
 * `null` arms are the three "not a first-party value import" cases, each
 * earned in {@link collectFileImports}'s own documentation: a type-only
 * declaration, a non-first-party specifier, and a declaration left with no
 * value binding at all (side-effect-only, or every specifier inline-typed).
 */
function valueImportOf(
  node: TSESTree.Program['body'][number],
  relPath: string
): { key: string; names: string[] } | null {
  if (node.type !== 'ImportDeclaration' || node.importKind === 'type') return null;
  const key = moduleKey(relPath, node.source.value);
  if (key === null) return null;
  const names = node.specifiers
    .filter((s) => s.type !== 'ImportSpecifier' || s.importKind !== 'type')
    .map((s) => s.local.name);
  return names.length === 0 ? null : { key, names };
}

/**
 * `byKey` with every shadowed local removed, and every key it emptied dropped.
 *
 * A key with two locals where only one is shadowed keeps the other: the
 * surviving binding alone then decides whether the module is used.
 */
function withoutShadowed(
  byKey: ReadonlyMap<string, readonly string[]>,
  shadowed: ReadonlySet<string>
): Map<string, string[]> {
  const kept = new Map<string, string[]>();
  for (const [key, names] of byKey) {
    const surviving = names.filter((name) => !shadowed.has(name));
    if (surviving.length > 0) kept.set(key, surviving);
  }
  return kept;
}

/** The accumulator threaded through {@link walkForUses}. */
interface UseScan {
  locals: ReadonlySet<string>;
  positions: Map<string, number[]>;
  shadowed: Set<string>;
}

/**
 * Node keys that never hold child nodes. `parent` is load-bearing: the parser
 * sets back-pointers and following them makes the walk cyclic. Same list and
 * same reasons as `units.ts`'s `NON_CHILD_KEYS`, kept local so neither walk
 * depends on the other's internals for one frozen constant.
 */
const NON_CHILD_KEYS = new Set(['parent', 'tokens', 'comments', 'loc', 'range', 'type']);

/** Narrowing helper: a non-null object with a string `type`. */
function isNode(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && typeof value === 'object' && typeof (value as never)['type'] === 'string'
  );
}

/**
 * Walk `program` once, recording qualifying use offsets and shadowing names.
 * Returns without touching the tree when the file imports nothing first-party —
 * the cheap path for files that only import dependencies.
 *
 * Offsets are SORTED at the end, not assumed ordered: a generic walk visits
 * properties in object-key order, close to source order but not guaranteed to
 * be it (a TS node's `typeAnnotation` can precede its `body`). Ascending order
 * is the precondition {@link usedImportKeys}'s early exit relies on, so it is
 * established. Each array holds one binding's call sites in one file.
 */
function scanUses(program: TSESTree.Program, locals: ReadonlySet<string>): UseScan {
  const scan: UseScan = { locals, positions: new Map(), shadowed: new Set() };
  if (locals.size === 0) return scan;
  walkForUses(program, scan, new Set<object>());
  for (const name of scan.shadowed) scan.positions.delete(name);
  for (const at of scan.positions.values()) at.sort((a, b) => a - b);
  return scan;
}

/** Recurse the tree, recording uses and shadows. */
function walkForUses(node: unknown, scan: UseScan, seen: Set<object>): void {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);
  if (Array.isArray(node)) {
    for (const item of node) walkForUses(item, scan, seen);
    return;
  }
  const record = node as Record<string, unknown>;
  recordUse(record, scan);
  recordShadows(record, scan);
  for (const [key, value] of Object.entries(record)) {
    if (NON_CHILD_KEYS.has(key)) continue;
    walkForUses(value, scan, seen);
  }
}

/** Record the qualifying use `node` makes of an import local, if any. */
function recordUse(node: Record<string, unknown>, scan: UseScan): void {
  const type = node['type'];
  if (type === 'CallExpression' || type === 'NewExpression') {
    record(calleeBinding(node['callee'], 'MemberExpression', 'Identifier'), scan);
    return;
  }
  if (type === 'JSXOpeningElement') {
    record(calleeBinding(node['name'], 'JSXMemberExpression', 'JSXIdentifier'), scan);
  }
}

/**
 * The identifier a callee (or JSX element name) binds to: the node itself when
 * it is an identifier, else the LEFTMOST object of its member chain — the
 * method-call receiver. `a.b.c()` binds `a`; `<Ui.Row />` binds `Ui`. One
 * function for both arms: the shapes differ only in node-type names, and a
 * second member-chain descent is the wrapper duplication this detector reports.
 */
function calleeBinding(
  node: unknown,
  chainType: string,
  leafType: string
): Record<string, unknown> | null {
  let current = node;
  while (isNode(current) && current['type'] === chainType) current = current['object'];
  return isNode(current) && current['type'] === leafType ? current : null;
}

/** Append `id`'s start offset to `positions`, when it names an import local. */
function record(id: Record<string, unknown> | null, scan: UseScan): void {
  if (id === null) return;
  const name = id['name'];
  if (typeof name !== 'string' || !scan.locals.has(name)) return;
  const range = id['range'] as [number, number] | undefined;
  if (range === undefined) return;
  const at = scan.positions.get(name);
  if (at === undefined) scan.positions.set(name, [range[0]]);
  else at.push(range[0]);
}

/**
 * Node types that introduce bindings, mapped to the keys holding them.
 *
 * `ImportSpecifier.local` is deliberately absent: that IS the import, not a
 * shadow of it. Type-space declarations (`TSTypeAliasDeclaration`,
 * `TSInterfaceDeclaration`) are absent too — a type name cannot shadow a value
 * binding in a call position.
 */
const BINDING_KEYS: Record<string, readonly string[]> = {
  FunctionDeclaration: ['id', 'params'],
  FunctionExpression: ['id', 'params'],
  ArrowFunctionExpression: ['params'],
  TSDeclareFunction: ['id', 'params'],
  ClassDeclaration: ['id'],
  ClassExpression: ['id'],
  VariableDeclarator: ['id'],
  CatchClause: ['param'],
};

/** Record every name `node` introduces as a binding. */
function recordShadows(node: Record<string, unknown>, scan: UseScan): void {
  const keys = BINDING_KEYS[node['type'] as string];
  if (keys === undefined) return;
  for (const key of keys) collectPatternNames(node[key], scan.shadowed);
}

/** Pattern node types whose bindings live under one child key. */
const PATTERN_CHILD_KEYS: Record<string, string> = {
  ObjectPattern: 'properties',
  ArrayPattern: 'elements',
  Property: 'value',
  AssignmentPattern: 'left',
  RestElement: 'argument',
  TSParameterProperty: 'parameter',
};

/** Flatten a binding pattern (or an array of them) into its declared names. */
function collectPatternNames(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectPatternNames(item, into);
    return;
  }
  if (!isNode(node)) return;
  if (node['type'] === 'Identifier') {
    const name = node['name'];
    if (typeof name === 'string') into.add(name);
    return;
  }
  const childKey = PATTERN_CHILD_KEYS[node['type'] as string];
  if (childKey !== undefined) collectPatternNames(node[childKey], into);
}

/**
 * The module keys USED inside one unit's character range, sorted.
 *
 * "Inside the unit body", not "anywhere in the file", is what turns a
 * non-signal into a signal: measured over this repository's 96 classes, the
 * file-level predicate the spec's D8 sentence describes labels 88 of them
 * (91.7%), including all 38 platform-mirror classes, whose four copies share
 * an import list by construction. The body-level predicate over qualifying
 * USES labels 7, none of them a mirror.
 *
 * A use is counted when its identifier's START offset lies in `[start, end]`.
 * The bound is INCLUSIVE at both ends, and that is the exported contract this
 * function owes its callers (spec criterion 11), not an implementation detail —
 * a caller holding a unit range and a `FileImports` is entitled to know which
 * offsets are in. Positions are ascending, so the scan stops at the first
 * offset past `end`.
 */
export function usedImportKeys(imports: FileImports, range: readonly [number, number]): string[] {
  const [start, end] = range;
  const used: string[] = [];
  for (const [key, locals] of imports.byKey) {
    if (locals.some((local) => referencedIn(imports.positions.get(local), start, end))) {
      used.push(key);
    }
  }
  return used.sort();
}

function referencedIn(at: readonly number[] | undefined, start: number, end: number): boolean {
  if (at === undefined) return false;
  for (const offset of at) {
    if (offset > end) return false;
    if (offset >= start) return true;
  }
  return false;
}

/**
 * The one module key every member uses, or `undefined`.
 *
 * When a class shares more than one module the LEXICOGRAPHICALLY SMALLEST key
 * wins. `sharedImport` is a single field by interface (spec's `CloneClass`), so
 * an arbitrary pick would make the published value depend on file-discovery
 * order; this one is total, stable under any input ordering, and cheap to state
 * in the docs.
 *
 * The first member's keys are sorted HERE rather than relying on
 * {@link usedImportKeys} having sorted them: `filter` preserves order, so
 * without this sort `common[0]` is the minimum only when the caller happened
 * to pass sorted input, and `[['z','a'],['a','z']]` would answer `'z'` while
 * the same two members in the other order answer `'a'`. That is precisely the
 * order-dependence this function exists to remove, and it is an exported API
 * (spec criterion 11) whose callers are not all in this file. One sort of a
 * k-element array, where k is one unit's first-party import count.
 */
export function sharedImportKey(perMember: ReadonlyArray<readonly string[]>): string | undefined {
  if (perMember.length === 0) return undefined;
  let common = [...perMember[0]!].sort();
  for (const keys of perMember.slice(1)) {
    const other = new Set(keys);
    common = common.filter((key) => other.has(key));
    if (common.length === 0) return undefined;
  }
  return common[0];
}
