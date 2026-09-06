import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';
import { isTestModifierCall } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'focusedTest';

export default createRule<[], MessageIds>({
  name: 'no-focused-tests',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow focused tests that must not be committed.',
    },
    messages: {
      focusedTest:
        "Focused test — remove '.only'/'f' prefix before committing so the whole suite runs.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    function isFocusedCall(node: TSESTree.CallExpression): boolean {
      // Any dotted chain rooted at describe/it/test ending in `.only` —
      // covers the flat Jest/Mocha spellings (describe.only, it.only,
      // test.only) AND Playwright's namespaced ones (test.describe.only,
      // test.describe.serial.only), which focus an entire block and so mute
      // every OTHER test in the file.
      if (isTestModifierCall(node, 'only')) {
        return true;
      }

      // Check for fdescribe() and fit()
      if (
        node.callee.type === 'Identifier' &&
        (node.callee.name === 'fdescribe' || node.callee.name === 'fit')
      ) {
        return true;
      }

      return false;
    }

    return {
      CallExpression(node) {
        if (isFocusedCall(node)) {
          context.report({
            node,
            messageId: 'focusedTest',
          });
        }
      },
    };
  },
});
