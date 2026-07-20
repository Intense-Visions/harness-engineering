import { ESLintUtils } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'emptyDescribe';

export default createRule<[], MessageIds>({
  name: 'no-empty-describe',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow describe blocks with no statements in their body.',
    },
    messages: {
      emptyDescribe: 'Empty describe block — remove or add tests to the describe block.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        // Check for describe() calls
        if (node.callee.type === 'Identifier' && node.callee.name === 'describe') {
          // The first argument can be a string literal or identifier, but we're only interested in the callback function
          const callback = node.arguments[1];

          if (
            callback &&
            (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')
          ) {
            // Check the body of the function
            if (callback.body.type === 'BlockStatement') {
              // Check if the block statement has any statements
              // This will be false for truly empty blocks like `() => {}`
              if (callback.body.body.length === 0) {
                context.report({
                  node,
                  messageId: 'emptyDescribe',
                });
              }
            }
          }
        }
      },
    };
  },
});
