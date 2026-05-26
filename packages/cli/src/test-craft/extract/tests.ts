/**
 * Per-test extractor — walks a test file's AST via TS Compiler API and
 * captures every `it(...)` / `test(...)` block with its nesting,
 * skip/todo/only flags, and body text.
 *
 * Source: docs/changes/craft-pipeline/test-craft/proposal.md
 *   (Technical Design → Per-test AST extraction).
 */

import ts from 'typescript';
import type { ExtractedTest, TestFramework } from '../findings/schema.js';

const MAX_BODY_CHARS = 1500;

export interface ExtractTestsInput {
  file: string;
  source: string;
  framework: TestFramework;
}

interface CalleeChain {
  /** Base name: 'it' / 'test' / 'describe' */
  base: string;
  /** Optional modifier: 'skip' / 'only' / 'todo' / 'each' */
  modifier: string | null;
}

export function extractTests(input: ExtractTestsInput): ExtractedTest[] {
  if (!/\.(?:test|spec)\.(?:tsx?|jsx?)$/i.test(input.file)) return [];

  let sourceFile: ts.SourceFile;
  try {
    sourceFile = ts.createSourceFile(
      input.file,
      input.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );
  } catch {
    return [];
  }

  const out: ExtractedTest[] = [];
  const describeStack: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const chain = resolveCallee(node.expression);
      if (chain !== null) {
        if (chain.base === 'describe') {
          const name = stringLiteralArg(node.arguments[0]);
          if (name !== null) {
            describeStack.push(name);
            ts.forEachChild(node, visit);
            describeStack.pop();
            return;
          }
        } else if (chain.base === 'it' || chain.base === 'test') {
          const name = stringLiteralArg(node.arguments[0]);
          if (name !== null) {
            const isTodo = chain.modifier === 'todo';
            // Skip extracting body when it's a todo (no callback at all is common).
            const body = isTodo ? '' : extractCallbackText(node.arguments[1], input.source);
            const { line: zeroLine } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            );
            out.push({
              file: input.file,
              line: zeroLine + 1,
              testName: name,
              nesting: [...describeStack],
              body:
                body.length > MAX_BODY_CHARS
                  ? body.slice(0, MAX_BODY_CHARS) + '\n[…truncated]'
                  : body,
              framework: input.framework,
              skipped: chain.modifier === 'skip',
              todo: isTodo,
              only: chain.modifier === 'only',
            });
          }
          // Don't recurse into the test body itself for new describes/its
          // (nested describes inside it bodies are highly unusual + would
          // pollute the nesting stack with sub-test names).
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return out;
}

function resolveCallee(expr: ts.Expression): CalleeChain | null {
  // Plain `it(...)` / `test(...)` / `describe(...)`
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (name === 'it' || name === 'test' || name === 'describe') {
      return { base: name, modifier: null };
    }
    return null;
  }
  // `it.skip(...)`, `test.only(...)`, `describe.each(...)`
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) {
    const base = expr.expression.text;
    const modifier = expr.name.text;
    if (
      (base === 'it' || base === 'test' || base === 'describe') &&
      (modifier === 'skip' || modifier === 'only' || modifier === 'todo' || modifier === 'each')
    ) {
      return { base, modifier };
    }
    return null;
  }
  return null;
}

function stringLiteralArg(node: ts.Node | undefined): string | null {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function extractCallbackText(node: ts.Node | undefined, fullSource: string): string {
  if (node === undefined) return '';
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    // Use raw source range so we get the actual written body verbatim
    return fullSource.slice(node.body.pos, node.body.end).trim();
  }
  return '';
}
