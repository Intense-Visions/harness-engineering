import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'skippedTest';

export default createRule<[], MessageIds>({
  name: 'no-skipped-tests',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow skipped tests that must not be committed.',
    },
    messages: {
      skippedTest:
        'Skipped test — it never runs and silently drops coverage; re-enable it or delete it.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isSkipCall(node: TSESTree.CallExpression): boolean {
      // Check for describe.skip(), it.skip(), test.skip()
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        (node.callee.object.name === 'describe' ||
          node.callee.object.name === 'it' ||
          node.callee.object.name === 'test') &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'skip'
      ) {
        return true;
      }

      // Check for xdescribe(), xit(), xtest()
      if (
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'xdescribe' ||
          node.callee.name === 'xit' ||
          node.callee.name === 'xtest')
      ) {
        return true;
      }

      return false;
    }

    return {
      CallExpression(node) {
        if (isSkipCall(node)) {
          context.report({
            node,
            messageId: 'skippedTest',
          });
        }
      },
    };
  },
});
