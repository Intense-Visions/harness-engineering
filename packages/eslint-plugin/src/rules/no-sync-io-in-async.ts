// src/rules/no-sync-io-in-async.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'syncIoInAsync';

const SYNC_FS_METHODS = new Set([
  'readFileSync',
  'writeFileSync',
  'existsSync',
  'readdirSync',
  'statSync',
  'mkdirSync',
  'unlinkSync',
  'copyFileSync',
  'renameSync',
  'accessSync',
]);

export default createRule<[], MessageIds>({
  name: 'no-sync-io-in-async',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow synchronous fs operations inside async functions',
    },
    messages: {
      syncIoInAsync: "Use async fs methods instead of '{{name}}' in async functions",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let asyncDepth = 0;

    function enterFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ) {
      if (node.async) {
        asyncDepth++;
      }
    }

    function exitFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ) {
      if (node.async) {
        asyncDepth--;
      }
    }

    return {
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      CallExpression(node: TSESTree.CallExpression) {
        if (asyncDepth === 0) return;

        let name: string | undefined;

        // Handle: readFileSync(...)
        if (node.callee.type === 'Identifier' && SYNC_FS_METHODS.has(node.callee.name)) {
          name = node.callee.name;
        }

        // Handle: fs.readFileSync(...)
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          SYNC_FS_METHODS.has(node.callee.property.name)
        ) {
          name = node.callee.property.name;
        }

        if (name) {
          context.report({
            node,
            messageId: 'syncIoInAsync',
            data: { name },
          });
        }
      },
    };
  },
});
