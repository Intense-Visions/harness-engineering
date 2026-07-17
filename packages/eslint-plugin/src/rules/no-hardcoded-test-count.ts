import { ESLintUtils, TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'hardcodedTestCount';

/** True when `node` is a call to the bare identifier `expect(...)`. */
function isExpectCall(node: TSESTree.Expression): node is TSESTree.CallExpression {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'expect'
  );
}

/** The matcher name of an `expect(...).<name>(...)` call, else null. */
function expectMatcherName(node: TSESTree.CallExpression): string | null {
  const callee = node.callee;
  if (
    callee.type === 'MemberExpression' &&
    isExpectCall(callee.object) &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
}

/** True when the first argument is a hardcoded numeric literal (the drift-prone count). */
function hasNumericLiteralArg(args: TSESTree.CallExpressionArgument[]): boolean {
  const arg = args[0];
  return arg !== undefined && arg.type === 'Literal' && typeof arg.value === 'number';
}

/** True when the value under assertion is a `<x>.length` access, i.e. `expect(x.length)`. */
function assertsLengthProperty(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'CallExpression') return false;
  const inner = callee.object.arguments[0];
  return (
    inner !== undefined &&
    inner.type === 'MemberExpression' &&
    inner.property.type === 'Identifier' &&
    inner.property.name === 'length'
  );
}

export default createRule<[], MessageIds>({
  name: 'no-hardcoded-test-count',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded numeric literals in test-count assertions.',
    },
    messages: {
      hardcodedTestCount:
        'Hardcoded test-count literal; counts drift when items change — compare against a derived value instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const matcher = expectMatcherName(node);
        if (matcher === null || !hasNumericLiteralArg(node.arguments)) return;
        // `expect(x).toHaveLength(<n>)` is always a hardcoded count;
        // `expect(x.length).toBe(<n>)` only when the value under test is a `.length`.
        if (matcher === 'toHaveLength' || (matcher === 'toBe' && assertsLengthProperty(node))) {
          context.report({ node, messageId: 'hardcodedTestCount' });
        }
      },
    };
  },
});
