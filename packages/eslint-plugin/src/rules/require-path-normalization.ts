// src/rules/require-path-normalization.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'missingNormalization';

/**
 * Detects `path.relative()` / `relative()` calls whose result is stored in a
 * variable or used inline WITHOUT being normalised with `.replaceAll('\\', '/')`
 * (or the equivalent `.replace(/\\\\/g, '/')`).
 *
 * On Windows, `path.relative()` returns backslash-separated paths. If those
 * paths flow into data structures, string comparisons, or serialised output
 * they will silently mismatch the forward-slash convention used everywhere else.
 */
function isRelativeCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;

  // relative(...)
  if (callee.type === 'Identifier' && callee.name === 'relative') {
    return true;
  }

  // path.relative(...)
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'path' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'relative'
  ) {
    return true;
  }

  return false;
}

function isReplaceMethod(parent: TSESTree.Node): parent is TSESTree.MemberExpression {
  return (
    parent.type === 'MemberExpression' &&
    parent.property.type === 'Identifier' &&
    (parent.property.name === 'replaceAll' || parent.property.name === 'replace')
  );
}

function isBackslashNormalizationArg(firstArg: TSESTree.CallExpressionArgument): boolean {
  // .replaceAll('\\', '/') — first arg is string literal '\\'
  if (firstArg.type === 'Literal' && firstArg.value === '\\') return true;
  // .replace(/\\/g, '/') — first arg is regex containing backslash
  if ('regex' in firstArg && firstArg.type === 'Literal') return true;
  return false;
}

function hasNormalization(node: TSESTree.CallExpression): boolean {
  const parent = node.parent;
  if (!parent || !isReplaceMethod(parent)) return false;

  const grandparent = parent.parent;
  if (grandparent?.type !== 'CallExpression' || grandparent.arguments.length < 1) return false;

  return isBackslashNormalizationArg(grandparent.arguments[0]!);
}

export default createRule<[], MessageIds>({
  name: 'require-path-normalization',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require path.relative() results to be normalized with .replaceAll("\\\\", "/") for cross-platform safety',
    },
    messages: {
      missingNormalization:
        "path.relative() result must be normalized with .replaceAll('\\\\', '/') for cross-platform compatibility.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isRelativeCall(node)) return;
        if (hasNormalization(node)) return;

        context.report({
          node,
          messageId: 'missingNormalization',
        });
      },
    };
  },
});
