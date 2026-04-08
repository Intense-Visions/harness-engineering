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

function isArrayMethodCall(node: TSESTree.MemberExpression): boolean {
  return node.property.type === 'Identifier' && ARRAY_METHODS.has(node.property.name);
}

function isInnerChainLink(node: TSESTree.MemberExpression): boolean {
  const callExpr = node.parent;
  if (!callExpr) return false;
  const parentMember = callExpr.parent;
  return (
    parentMember !== null &&
    parentMember !== undefined &&
    parentMember.type === 'MemberExpression' &&
    parentMember.property.type === 'Identifier' &&
    ARRAY_METHODS.has(parentMember.property.name)
  );
}

function countChainLength(node: TSESTree.MemberExpression): number {
  let length = 1;
  let current: TSESTree.MemberExpression = node;
  while (true) {
    const obj = current.object;
    if (
      obj.type !== 'CallExpression' ||
      obj.callee.type !== 'MemberExpression' ||
      obj.callee.property.type !== 'Identifier' ||
      !ARRAY_METHODS.has(obj.callee.property.name)
    ) {
      break;
    }
    length++;
    current = obj.callee;
  }
  return length;
}

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
        if (!isArrayMethodCall(node)) return;
        if (isInnerChainLink(node)) return;

        const callExpr = node.parent!;
        if (countChainLength(node) >= 3) {
          context.report({ node: callExpr, messageId: 'unboundedArrayChain' });
        }
      },
    };
  },
});
