import { ESLintUtils } from '@typescript-eslint/utils';

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
    return {
      CallExpression(node) {
        // Check for describe.only(), it.only(), test.only()
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          (node.callee.object.name === 'describe' ||
            node.callee.object.name === 'it' ||
            node.callee.object.name === 'test') &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'only'
        ) {
          context.report({
            node,
            messageId: 'focusedTest',
          });
        }

        // Check for fdescribe() and fit()
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'fdescribe' || node.callee.name === 'fit')
        ) {
          context.report({
            node,
            messageId: 'focusedTest',
          });
        }
      },
    };
  },
});
