/**
 * AST code-unit extractor — a single TS Compiler API walk per file that emits
 * the substantive units a senior actually reviews: functions, methods, and
 * classes. Trivial units are filtered out so the critique loop spends LLM
 * budget only where craft judgment can move the needle.
 *
 * A "substantive" function/method has a body with at least
 * MIN_BODY_STATEMENTS statements OR any control-flow construct
 * (if/for/while/switch/try). Getters, one-line arrows, and pass-through
 * wrappers are skipped. A class is substantive when it declares at least one
 * method or a non-empty constructor.
 *
 * This is the FP/cost-management analogue of security-craft's zero-signal
 * skip: files with no substantive unit are skipped entirely, and
 * `filesSkippedNoUnit` records how aggressively the filter trimmed the corpus.
 *
 * AST awareness (not regex) means a `function` keyword inside a comment or
 * string never fires, and anonymous callbacks inherit a best-effort name from
 * their binding site.
 *
 * Source: docs/changes/code-craft/proposal.md (Technical Design → unit extraction).
 */

import ts from 'typescript';
import type { CodeUnit, UnitKind } from '../findings/schema.js';

/** A function/method body must clear one of these bars to earn a critique. */
const MIN_BODY_STATEMENTS = 3;

const CONTROL_FLOW_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.ConditionalExpression,
]);

export function extractUnits(sourceText: string, filePath: string): CodeUnit[] {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(filePath)) return [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  } catch {
    return [];
  }

  const out: CodeUnit[] = [];
  const seen = new Set<string>();
  visit(sourceFile, sourceFile, out, seen);
  return out;
}

function visit(node: ts.Node, sf: ts.SourceFile, out: CodeUnit[], seen: Set<string>): void {
  if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
    if (classIsSubstantive(node)) {
      emit(out, seen, 'class', className(node), node, sf);
    }
    // Methods are collected by the generic function-like handling below.
  }

  const fnLike = asFunctionLike(node);
  if (fnLike !== undefined && fnBodyIsSubstantive(fnLike.node)) {
    emit(out, seen, fnLike.kind, functionName(fnLike.node), node, sf);
  }

  ts.forEachChild(node, (child) => visit(child, sf, out, seen));
}

interface FunctionLike {
  kind: UnitKind;
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration;
}

function asFunctionLike(node: ts.Node): FunctionLike | undefined {
  if (ts.isMethodDeclaration(node)) return { kind: 'method', node };
  if (ts.isFunctionDeclaration(node)) return { kind: 'function', node };
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
    // A method-shaped assignment (property whose value is a function) reads as
    // a method; everything else is a free function.
    const kind: UnitKind = ts.isPropertyAssignment(node.parent) ? 'method' : 'function';
    return { kind, node };
  }
  return undefined;
}

function fnBodyIsSubstantive(
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
): boolean {
  const body = node.body;
  if (body === undefined) return false; // overload signature / declaration only
  // Expression-bodied arrow: substantive only if it hides control flow.
  if (!ts.isBlock(body)) return hasControlFlow(body);
  if (body.statements.length >= MIN_BODY_STATEMENTS) return true;
  return body.statements.some((stmt) => hasControlFlow(stmt));
}

function hasControlFlow(node: ts.Node): boolean {
  if (CONTROL_FLOW_KINDS.has(node.kind)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && hasControlFlow(child)) found = true;
  });
  return found;
}

function classIsSubstantive(node: ts.ClassDeclaration | ts.ClassExpression): boolean {
  return node.members.some((member) => {
    if (ts.isMethodDeclaration(member)) return true;
    if (ts.isConstructorDeclaration(member)) {
      return member.body !== undefined && member.body.statements.length > 0;
    }
    return false;
  });
}

function className(node: ts.ClassDeclaration | ts.ClassExpression): string {
  return node.name?.text ?? '<anonymous class>';
}

function functionName(
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration
): string {
  if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) {
    if (node.name !== undefined) return node.name.text;
  }
  if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }
  return nameFromBinding(node.parent);
}

/** Recover a name from the arrow/expression's binding site: `const x = () => …`. */
function nameFromBinding(parent: ts.Node): string {
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  if (ts.isPropertyDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return '<anonymous>';
}

function emit(
  out: CodeUnit[],
  seen: Set<string>,
  kind: UnitKind,
  name: string,
  node: ts.Node,
  sf: ts.SourceFile
): void {
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const key = `${kind}:${name}:${line}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({ kind, name, line, endLine });
}

/** Slice a unit's own source text (line..endLine), capped at `maxChars`. */
export function unitSource(sourceText: string, unit: CodeUnit, maxChars: number): string {
  const lines = sourceText.split('\n');
  const lo = Math.max(0, unit.line - 1);
  const hi = Math.min(lines.length, unit.endLine);
  const slice = lines.slice(lo, hi).join('\n');
  return slice.length > maxChars ? slice.slice(0, maxChars) + '\n[…truncated for cost…]' : slice;
}
