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

function getSyncMethodName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === 'Identifier' && SYNC_FS_METHODS.has(node.callee.name)) {
    return node.callee.name;
  }
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    SYNC_FS_METHODS.has(node.callee.property.name)
  ) {
    return node.callee.property.name;
  }
  return undefined;
}

type AsyncFunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

function adjustAsyncDepth(
  node: AsyncFunctionNode,
  depthRef: { value: number },
  delta: number
): void {
  if (node.async) {
    depthRef.value += delta;
  }
}

function checkSyncCallInAsync(
  node: TSESTree.CallExpression,
  depthRef: { value: number },
  reportFn: (name: string) => void
): void {
  if (depthRef.value === 0) return;
  const name = getSyncMethodName(node);
  if (name) {
    reportFn(name);
  }
}

type RuleContext = Parameters<ReturnType<typeof createRule<[], MessageIds>>['create']>[0];

function reportSyncCallExpression(
  node: TSESTree.CallExpression,
  context: RuleContext,
  asyncDepthRef: { value: number }
): void {
  checkSyncCallInAsync(node, asyncDepthRef, (name) => {
    context.report({ node, messageId: 'syncIoInAsync', data: { name } });
  });
}

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
    const asyncDepthRef = { value: 0 };

    const enterFunction = (node: AsyncFunctionNode): void =>
      adjustAsyncDepth(node, asyncDepthRef, 1);
    const exitFunction = (node: AsyncFunctionNode): void =>
      adjustAsyncDepth(node, asyncDepthRef, -1);

    return {
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      CallExpression(node: TSESTree.CallExpression) {
        reportSyncCallExpression(node, context, asyncDepthRef);
      },
    };
  },
});
