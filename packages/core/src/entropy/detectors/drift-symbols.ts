import type { CodebaseSnapshot } from '../types';

/**
 * The symbol index the api-signature drift check resolves doc references
 * against (issue #2078).
 *
 * `snapshot.exportMap` is built from each parser's `extractExports`, which for
 * TypeScript records VALUE declarations only (`function`, `class`, `const`).
 * Checked against that alone, every documented `export type`, `export
 * interface` and `export enum` — and every file-local declaration such as
 * `const TOOL_HANDLERS: Record<…> = {` — looked missing, and the fuzzy matcher
 * then labelled it RENAMED. The export map also feeds the dead-code detector,
 * so widening it there would change dead-code verdicts; the drift check builds
 * its own wider index here instead.
 *
 * A doc reference is drift when the symbol is declared nowhere, so the index is
 * every top-level declaration name: the exports, the parser's internal
 * (unexported) symbols, and the type-level declarations read from the ESTree
 * program for TS/JS files.
 */
export function collectDeclaredNames(snapshot: CodebaseSnapshot): Set<string> {
  const names = new Set<string>(snapshot.exportMap.byName.keys());
  for (const file of snapshot.files) {
    for (const sym of file.internalSymbols ?? []) names.add(sym.name);
    for (const name of topLevelDeclarationNames(file.ast)) names.add(name);
  }
  return names;
}

interface DeclNode {
  type: string;
  id?: { type?: string; name?: string } | null;
  declarations?: Array<{ id?: { type?: string; name?: string } }>;
  declaration?: DeclNode | null;
}

/** Declaration kinds whose `id` names a top-level symbol. */
const NAMED_DECLARATIONS = new Set([
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSDeclareFunction',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
]);

function declarationNames(node: DeclNode | null | undefined): string[] {
  if (!node) return [];
  if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') {
    return declarationNames(node.declaration);
  }
  if (node.type === 'VariableDeclaration') {
    return (node.declarations ?? []).flatMap((d) =>
      d.id?.type === 'Identifier' && d.id.name ? [d.id.name] : []
    );
  }
  if (NAMED_DECLARATIONS.has(node.type) && node.id?.type === 'Identifier' && node.id.name) {
    return [node.id.name];
  }
  return [];
}

function topLevelDeclarationNames(ast: CodebaseSnapshot['files'][number]['ast']): string[] {
  if (!ast || (ast.language !== 'typescript' && ast.language !== 'javascript')) return [];
  const program = ast.body as { body?: unknown } | undefined;
  if (!Array.isArray(program?.body)) return [];
  return (program.body as DeclNode[]).flatMap(declarationNames);
}

/**
 * Reduce a doc reference to the bare symbol name to look up.
 *
 * - A code-block import specifier keeps its TS modifiers and alias
 *   (`type Result`, `type HookProfile as Profile`); the symbol is the name
 *   before `as`, without the `type` modifier.
 * - A dotted reference (`User.email`) resolves to its head segment, since the
 *   index only tracks top-level symbols (github issue #816).
 */
export function resolveReferenceName(reference: string): string {
  const bare = reference
    .trim()
    .replace(/^type\s+/, '')
    .replace(/\s+as\s+\S+$/, '');
  return bare.includes('.') ? (bare.split('.')[0] ?? bare) : bare;
}
