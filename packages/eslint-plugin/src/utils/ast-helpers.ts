// src/utils/ast-helpers.ts
import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';

/**
 * Return true if the last non-empty line before the node ends a block comment.
 */
function lastNonEmptyLineEndsBlockComment(lines: string[]): boolean {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? '';
    if (line === '') continue;
    return line.endsWith('*/');
  }
  return false;
}

/**
 * Return true if the text contains a JSDoc block (/** ... *\/).
 */
function textContainsJSDoc(text: string): boolean {
  const startIdx = text.lastIndexOf('/**');
  const endIdx = text.lastIndexOf('*/');
  return startIdx !== -1 && endIdx > startIdx;
}

/**
 * Check if a node has a preceding JSDoc comment
 */
export function hasJSDocComment(node: TSESTree.Node, sourceCode: string): boolean {
  if (!node.range) return false;

  const textBefore = sourceCode.slice(0, node.range[0]);
  const lines = textBefore.split('\n');

  if (!lastNonEmptyLineEndsBlockComment(lines)) return false;
  return textContainsJSDoc(textBefore);
}

// Keys to skip to avoid circular references during AST traversal
const SKIP_KEYS = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

// Zod validation method names
const ZOD_PARSE_METHODS = new Set(['parse', 'safeParse']);

/**
 * Check if a node is a Zod .parse() or .safeParse() call
 */
function isZodParseCall(node: TSESTree.Node): boolean {
  if ((node.type as AST_NODE_TYPES) !== AST_NODE_TYPES.CallExpression) return false;

  const callee = (node as TSESTree.CallExpression).callee;
  if ((callee.type as AST_NODE_TYPES) !== AST_NODE_TYPES.MemberExpression) return false;

  const prop = (callee as TSESTree.MemberExpression).property;
  if ((prop.type as AST_NODE_TYPES) !== AST_NODE_TYPES.Identifier) return false;

  return ZOD_PARSE_METHODS.has((prop as TSESTree.Identifier).name);
}

/**
 * Visit child properties of an AST node, calling visitor on each child node.
 */
function visitChildren(node: TSESTree.Node, visitor: (child: TSESTree.Node) => void): void {
  for (const key of Object.keys(node)) {
    if (SKIP_KEYS.has(key)) continue;

    const value = (node as unknown as Record<string, unknown>)[key];
    if (!value || typeof value !== 'object') continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && 'type' in item) {
          visitor(item as TSESTree.Node);
        }
      }
    } else if ('type' in value) {
      visitor(value as TSESTree.Node);
    }
  }
}

/**
 * Check if a function body contains Zod validation (.parse or .safeParse)
 */
export function hasZodValidation(body: TSESTree.BlockStatement): boolean {
  let found = false;

  function visit(node: TSESTree.Node): void {
    if (found) return;
    if (isZodParseCall(node)) {
      found = true;
      return;
    }
    visitChildren(node, visit);
  }

  visit(body);
  return found;
}

/**
 * Check if a node is marked with @internal
 */
export function isMarkedInternal(node: TSESTree.Node, sourceCode: string): boolean {
  if (!node.range) return false;

  const textBefore = sourceCode.slice(0, node.range[0]);
  const lastComment = textBefore.lastIndexOf('/**');
  if (lastComment === -1) return false;

  const commentEnd = textBefore.lastIndexOf('*/');
  if (commentEnd === -1 || commentEnd < lastComment) return false;

  const comment = textBefore.slice(lastComment, commentEnd + 2);
  return comment.includes('@internal');
}
