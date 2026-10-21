import { posix as pathPosix } from 'node:path';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * The module-identity key for one import, and the token offsets of the local
 * bindings it introduces.
 *
 * `byKey` maps a module key to the VALUE binding names that module introduces
 * into the file; `positions` maps each of those names to the ascending start
 * offsets at which it appears as an identifier token anywhere in the file.
 * Both are built in one pass per file so that asking "does THIS unit reference
 * an import" costs no further token scan — the detector extracts ~13,400 units
 * over ~1.6M tokens at this repository's scope, so a per-unit rescan is not an
 * option (`normalizeTokens` binary-searches for the same reason).
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
 * FS-FREE and therefore deterministic: keys are only ever COMPARED across the
 * members of a clone class, never read, so proving the file exists buys
 * nothing and would cost one `existsSync` per candidate extension per import.
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
 */
export function moduleKey(fromRelPath: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
  const joined = pathPosix.normalize(pathPosix.join(pathPosix.dirname(fromRelPath), specifier));
  if (joined === '..' || joined.startsWith('../')) return null;
  return joined.replace(SPECIFIER_EXTENSION, '');
}

/**
 * Collect one file's first-party value imports and its binding positions.
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
  return { byKey, positions: bindingPositions(program, locals) };
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
 * Ascending identifier offsets for each of `locals`, from ONE pass over the
 * file's tokens.
 *
 * Ascending by construction — `program.tokens` is left-to-right — which is the
 * precondition {@link usedImportKeys}'s early exit relies on. Returns empty
 * without touching the token array when the file imports nothing first-party,
 * which is the cheap path for the many files that only import dependencies.
 */
function bindingPositions(
  program: TSESTree.Program,
  locals: ReadonlySet<string>
): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  if (locals.size === 0) return positions;
  for (const token of program.tokens ?? []) {
    if (token.type !== 'Identifier' && token.type !== 'JSXIdentifier') continue;
    if (!locals.has(token.value)) continue;
    const at = positions.get(token.value);
    if (at === undefined) positions.set(token.value, [token.range[0]]);
    else at.push(token.range[0]);
  }
  return positions;
}

/**
 * The module keys referenced INSIDE one unit's character range, sorted.
 *
 * "Inside the unit body", not "anywhere in the file", is what turns a
 * non-signal into a signal: measured over this repository's 96 classes, the
 * file-level predicate the spec's D8 sentence describes labels 88 of them
 * (91.7%), including all 38 platform-mirror classes, whose four copies share
 * an import list by construction. The body-level predicate labels 10, none of
 * them a mirror.
 *
 * A token is counted when its START offset lies in `[start, end]`. An
 * identifier is one token and a unit's range ends on its own closing token, so
 * a binding that starts inside the unit ends inside it — the same selection
 * `normalizeTokens` documents (`range[0] >= start && range[1] <= end`) without
 * carrying a second offset per position. Positions are ascending from one
 * left-to-right pass, so the scan stops at the first offset past `end`.
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
 * The one module key every member references, or `undefined`.
 *
 * When a class shares more than one module — 2 of the 10 classes this
 * repository labels — the LEXICOGRAPHICALLY SMALLEST key wins. `sharedImport`
 * is a single field by interface (spec's `CloneClass`), so an arbitrary pick
 * would make the published value depend on file-discovery order; this one is
 * total, stable under any input ordering, and cheap to state in the docs.
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
