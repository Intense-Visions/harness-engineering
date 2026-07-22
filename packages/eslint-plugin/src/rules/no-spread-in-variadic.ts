import { ESLintUtils } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'spreadInVariadic';

/**
 * `Math.min(...arr)` / `Math.max(...arr)` spread every array element onto the call
 * stack as a separate argument. For a large array (~65k+ elements on V8) that throws
 * `RangeError: Maximum call stack size exceeded` — an input-dependent runtime crash a
 * type checker cannot catch. A reduce/loop (`arr.reduce((a, b) => Math.min(a, b))`) is
 * bounded and safe. This rule flags the spread form so the crash is caught at lint time.
 */
export default createRule<[], MessageIds>({
  name: 'no-spread-in-variadic',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow spreading an array into Math.min/Math.max, which throws RangeError on large inputs.',
    },
    messages: {
      spreadInVariadic:
        'Spreading an array into {{callee}} throws "Maximum call stack size exceeded" for large arrays (~65k+ elements). Use a reduce/loop instead, e.g. `arr.reduce((a, b) => {{callee}}(a, b))`.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression): void {
        const { callee } = node;
        // Callee must be `Math.min` / `Math.max` — a non-computed member on `Math`.
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.object.type !== 'Identifier' || callee.object.name !== 'Math') return;
        if (callee.property.type !== 'Identifier') return;
        const method = callee.property.name;
        if (method !== 'min' && method !== 'max') return;
        // Flag only when an argument is spread (`...arr`); plain args are safe.
        if (!node.arguments.some((arg) => arg.type === 'SpreadElement')) return;
        context.report({
          node,
          messageId: 'spreadInVariadic',
          data: { callee: `Math.${method}` },
        });
      },
    };
  },
});
