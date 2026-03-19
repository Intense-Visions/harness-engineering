// src/rules/no-unbounded-array-chains.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'unboundedArrayChain';

const ARRAY_METHODS = new Set([
  'filter',
  'map',
  'reduce',
  'sort',
  'flatMap',
  'find',
  'some',
  'every',
  'forEach',
]);

export default createRule<[], MessageIds>({
  name: 'no-unbounded-array-chains',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow 3+ chained array operations',
    },
    messages: {
      unboundedArrayChain: '3+ chained array operations — consider a single-pass approach',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      'CallExpression > MemberExpression.callee'(node: TSESTree.MemberExpression) {
        // Only care about array method calls
        if (node.property.type !== 'Identifier' || !ARRAY_METHODS.has(node.property.name)) {
          return;
        }

        // Skip if this call is itself the object of another array method call
        // (i.e., not the outermost in the chain). Only report on the outermost.
        const callExpr = node.parent!;
        if (
          callExpr.parent &&
          callExpr.parent.type === 'MemberExpression' &&
          callExpr.parent.property.type === 'Identifier' &&
          ARRAY_METHODS.has(callExpr.parent.property.name)
        ) {
          return;
        }

        // Count the chain length by walking down through the object
        let chainLength = 1;
        let current: TSESTree.Node = node;

        while (true) {
          const memberExpr = current as TSESTree.MemberExpression;
          const obj = memberExpr.object;

          if (
            obj.type === 'CallExpression' &&
            obj.callee.type === 'MemberExpression' &&
            obj.callee.property.type === 'Identifier' &&
            ARRAY_METHODS.has(obj.callee.property.name)
          ) {
            chainLength++;
            current = obj.callee;
          } else {
            break;
          }
        }

        if (chainLength >= 3) {
          context.report({
            node: callExpr,
            messageId: 'unboundedArrayChain',
          });
        }
      },
    };
  },
});
