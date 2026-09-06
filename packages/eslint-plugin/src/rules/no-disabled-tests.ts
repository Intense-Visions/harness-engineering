import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { isTestModifierCall } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'disabledTest';

export default createRule<[], MessageIds>({
  name: 'no-disabled-tests',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow disabled tests that must not be committed.',
    },
    messages: {
      disabledTest:
        'Disabled test — it never runs and silently drops coverage; re-enable it or delete it.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isDisabledCall(node: TSESTree.CallExpression): boolean {
      // Any dotted chain rooted at describe/it/test ending in `.skip` —
      // covers the flat Jest/Mocha spellings (describe.skip, it.skip,
      // test.skip) AND Playwright's namespaced ones (test.describe.skip,
      // test.describe.serial.skip), which mute an entire block.
      if (isTestModifierCall(node, 'skip')) {
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
        if (isDisabledCall(node)) {
          context.report({
            node,
            messageId: 'disabledTest',
          });
        }
      },
    };
  },
});
