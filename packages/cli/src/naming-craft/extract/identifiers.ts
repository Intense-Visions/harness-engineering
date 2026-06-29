/**
 * Identifier extraction via TS Compiler API. Walks a source file and
 * collects every variable / function / type identifier along with
 * declaration line, export status, scope size, and surrounding context
 * lines for LLM prompt construction.
 *
 * Source: docs/changes/craft-pipeline/naming-craft/proposal.md
 *   (Technical Design → Identifier extraction).
 */

import ts from 'typescript';
import type { IdentifierKind } from '../findings/schema.js';

export interface ExtractedIdentifier {
  name: string;
  kind: Exclude<IdentifierKind, 'file'>;
  file: string;
  line: number;
  exported: boolean;
  scopeSize: 'short' | 'long';
  contextLines: string[];
}

const SHORT_SCOPE_BODY_LINE_THRESHOLD = 10;

export function extractIdentifiers(file: string, source: string): ExtractedIdentifier[] {
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  } catch {
    return [];
  }

  const out: ExtractedIdentifier[] = [];
  const sourceLines = source.split('\n');

  function visit(node: ts.Node, parentBodyLineSize: number | null): void {
    collectDeclaredIdentifiers(node, sourceFile, sourceLines, out, parentBodyLineSize);

    // recurse — compute body line size if entering a function body
    const nextParentBodyLineSize = computeChildBodyLineSize(node, sourceFile, parentBodyLineSize);
    ts.forEachChild(node, (child) => visit(child, nextParentBodyLineSize));
  }

  visit(sourceFile, null);
  return out;
}

// Collect the declared identifier(s) for a single node (function / type / variable
// declarations). Node kinds are mutually exclusive, so each branch is independent.
function collectDeclaredIdentifiers(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  sourceLines: string[],
  out: ExtractedIdentifier[],
  parentBodyLineSize: number | null
): void {
  // function declarations
  if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
    pushIdentifier(
      node.name.text,
      'function',
      node,
      sourceFile,
      sourceLines,
      out,
      parentBodyLineSize
    );
    return;
  }
  // interface / type alias / class declarations
  if (isTypeLikeDeclaration(node) && node.name !== undefined) {
    pushIdentifier(node.name.text, 'type', node, sourceFile, sourceLines, out, parentBodyLineSize);
    return;
  }
  // const / let variable declarations (also handles destructuring binders)
  if (ts.isVariableStatement(node)) {
    pushVariableIdentifiers(node, sourceFile, sourceLines, out, parentBodyLineSize);
  }
}

type NamedTypeDeclaration = ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.ClassDeclaration;

function isTypeLikeDeclaration(node: ts.Node): node is NamedTypeDeclaration {
  return (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node)
  );
}

function pushVariableIdentifiers(
  node: ts.VariableStatement,
  sourceFile: ts.SourceFile,
  sourceLines: string[],
  out: ExtractedIdentifier[],
  parentBodyLineSize: number | null
): void {
  for (const decl of node.declarationList.declarations) {
    for (const binding of collectBindingNames(decl.name)) {
      const kind = variableInitializerKind(decl.initializer);
      pushIdentifier(binding, kind, decl, sourceFile, sourceLines, out, parentBodyLineSize);
    }
  }
}

// Detect if the init is a function expression → kind=function
function variableInitializerKind(initializer: ts.Expression | undefined): 'variable' | 'function' {
  return initializer !== undefined &&
    (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ? 'function'
    : 'variable';
}

// Compute the body line size to propagate to children: the entered function
// body's span when the node is function-like, otherwise the inherited value.
function computeChildBodyLineSize(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  parentBodyLineSize: number | null
): number | null {
  const body = functionBodyOf(node);
  if (body === undefined) return parentBodyLineSize;
  const start = sourceFile.getLineAndCharacterOfPosition(body.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(body.getEnd()).line;
  return end - start + 1;
}

function functionBodyOf(node: ts.Node): ts.Node | undefined {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)) &&
    node.body !== undefined
  ) {
    return node.body;
  }
  return undefined;
}

function pushIdentifier(
  name: string,
  kind: 'variable' | 'function' | 'type',
  node: ts.Node,
  sourceFile: ts.SourceFile,
  sourceLines: string[],
  out: ExtractedIdentifier[],
  parentBodyLineSize: number | null
): void {
  const { line: zeroLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const line = zeroLine + 1;
  out.push({
    name,
    kind,
    file: sourceFile.fileName,
    line,
    exported: hasExportModifier(node),
    scopeSize:
      parentBodyLineSize !== null && parentBodyLineSize <= SHORT_SCOPE_BODY_LINE_THRESHOLD
        ? 'short'
        : 'long',
    contextLines: extractContextLines(sourceLines, zeroLine, 2),
  });
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = (node as unknown as { modifiers?: readonly ts.ModifierLike[] }).modifiers;
  if (mods === undefined) return false;
  return mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function collectBindingNames(binding: ts.BindingName): string[] {
  if (ts.isIdentifier(binding)) return [binding.text];
  const names: string[] = [];
  if (ts.isObjectBindingPattern(binding) || ts.isArrayBindingPattern(binding)) {
    for (const element of binding.elements) {
      if (ts.isBindingElement(element)) {
        for (const n of collectBindingNames(element.name)) names.push(n);
      }
    }
  }
  return names;
}

function extractContextLines(lines: string[], zeroLine: number, radius: number): string[] {
  const start = Math.max(0, zeroLine - radius);
  const end = Math.min(lines.length, zeroLine + radius + 1);
  return lines.slice(start, end);
}
