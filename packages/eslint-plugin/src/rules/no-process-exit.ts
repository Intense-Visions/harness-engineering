import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'noProcessExit';

export default createRule<[], MessageIds>({
  name: 'no-process-exit',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct process.exit() calls that bypass graceful shutdown.',
    },
    messages: {
      noProcessExit:
        'Direct process.exit() call — use graceful shutdown instead to allow pending async cleanup.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check for process.exit() and process.exit(1) calls
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'process' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'exit'
        ) {
          context.report({
            node,
            messageId: 'noProcessExit',
          });
        }
      },
    };
  },
});
