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
 * Visit each element of an array property, calling visitor on AST nodes.
 */
function visitArrayItems(items: unknown[], visitor: (child: TSESTree.Node) => void): void {
  for (const item of items) {
    if (item && typeof item === 'object' && 'type' in item) {
      visitor(item as TSESTree.Node);
    }
  }
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
      visitArrayItems(value, visitor);
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

/**
 * Test-runner globals that can carry a `.skip` / `.only` style modifier.
 * A modifier chain is only interesting when it is rooted at one of these.
 */
const TEST_GLOBALS = new Set(['describe', 'it', 'test']);

/**
 * Resolve a call's callee to its dotted member chain, e.g.
 * `test.describe.serial.skip(...)` -> `['test', 'describe', 'serial', 'skip']`.
 *
 * Returns null unless the chain is a plain, statically written dotted path:
 * every link must be a non-computed `Identifier` and the root must be a bare
 * `Identifier`. Computed access (`test['skip']()`), optional chaining and
 * call/`this` roots resolve to null — they are out of scope here.
 */
function resolveCalleeChain(callee: TSESTree.Expression): string[] | null {
  const chain: string[] = [];
  let current: TSESTree.Node = callee;

  while ((current.type as AST_NODE_TYPES) === AST_NODE_TYPES.MemberExpression) {
    const member = current as TSESTree.MemberExpression;
    if (member.computed || member.optional) return null;
    if ((member.property.type as AST_NODE_TYPES) !== AST_NODE_TYPES.Identifier) return null;
    chain.unshift((member.property as TSESTree.Identifier).name);
    current = member.object;
  }

  if ((current.type as AST_NODE_TYPES) !== AST_NODE_TYPES.Identifier) return null;
  chain.unshift((current as TSESTree.Identifier).name);
  return chain;
}

/**
 * Check whether a call is a test-runner modifier call of the given kind —
 * i.e. a dotted chain rooted at `describe` / `it` / `test` whose FINAL link is
 * `modifier`.
 *
 * This walks the whole callee chain instead of assuming a single-level member
 * expression, so Playwright's namespaced spellings are covered alongside the
 * flat Jest/Mocha ones:
 *
 *   describe.skip(...)                  -> true  (flat)
 *   test.skip(...)                      -> true  (flat)
 *   test.describe.skip(...)             -> true  (nested — mutes a whole block)
 *   test.describe.serial.skip(...)      -> true  (modifier chain)
 *   test.describe(...)                  -> false (no modifier)
 *   rateLimiter.skip(...)               -> false (root is not a test global)
 */
export function isTestModifierCall(node: TSESTree.CallExpression, modifier: string): boolean {
  if ((node.callee.type as AST_NODE_TYPES) !== AST_NODE_TYPES.MemberExpression) return false;

  const chain = resolveCalleeChain(node.callee);
  // A modifier chain needs a root plus at least one property link.
  if (!chain || chain.length < 2) return false;

  return TEST_GLOBALS.has(chain[0] as string) && chain[chain.length - 1] === modifier;
}
