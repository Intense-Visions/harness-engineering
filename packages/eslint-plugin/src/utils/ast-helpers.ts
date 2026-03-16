// src/utils/ast-helpers.ts
import type { TSESTree } from '@typescript-eslint/utils';

/**
 * Check if a node has a preceding JSDoc comment
 */
export function hasJSDocComment(node: TSESTree.Node, sourceCode: string): boolean {
  if (!node.range) return false;

  // Get text before the node
  const textBefore = sourceCode.slice(0, node.range[0]);
  const lines = textBefore.split('\n');

  // Look backwards for /** ... */
  let foundJSDoc = false;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim() ?? '';

    // Empty line or whitespace - keep looking
    if (line === '') continue;

    // Found JSDoc end
    if (line.endsWith('*/')) {
      // Check if it's JSDoc (starts with /**)
      const startIdx = textBefore.lastIndexOf('/**');
      const endIdx = textBefore.lastIndexOf('*/');
      if (startIdx !== -1 && endIdx > startIdx) {
        foundJSDoc = true;
      }
      break;
    }

    // Found something else - no JSDoc
    break;
  }

  return foundJSDoc;
}

/**
 * Check if a function body contains Zod validation (.parse or .safeParse)
 */
export function hasZodValidation(body: TSESTree.BlockStatement): boolean {
  let found = false;

  // Keys to skip to avoid circular references
  const skipKeys = new Set(['parent', 'loc', 'range', 'tokens', 'comments']);

  function visit(node: TSESTree.Node): void {
    if (found) return;

    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const prop = node.callee.property;
      if (prop.type === 'Identifier' && (prop.name === 'parse' || prop.name === 'safeParse')) {
        found = true;
        return;
      }
    }

    // Recursively visit children
    for (const key of Object.keys(node)) {
      if (skipKeys.has(key)) continue;

      const value = (node as unknown as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === 'object' && 'type' in item) {
              visit(item as TSESTree.Node);
            }
          }
        } else if ('type' in value) {
          visit(value as TSESTree.Node);
        }
      }
    }
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
