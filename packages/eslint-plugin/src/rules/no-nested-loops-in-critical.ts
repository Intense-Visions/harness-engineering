// src/rules/no-nested-loops-in-critical.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'nestedLoopInCritical';

type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

function getAnnotationTarget(node: FunctionNode): TSESTree.Node {
  const parentType = node.parent?.type;
  if (parentType === 'ExportNamedDeclaration' || parentType === 'VariableDeclaration') {
    return node.parent as TSESTree.Node;
  }
  return node;
}

function hasCriticalAnnotation(node: FunctionNode, sourceText: string): boolean {
  const target = getAnnotationTarget(node);
  const startLine = target.loc.start.line; // 1-indexed
  const lines = sourceText.split('\n');
  for (let i = Math.max(0, startLine - 2); i < startLine; i++) {
    if (lines[i]?.includes('@perf-critical')) return true;
  }
  return false;
}

function makeEnterFunction(
  criticalStack: boolean[],
  loopDepthRef: { value: number },
  sourceText: string
) {
  return function enterFunction(node: FunctionNode): void {
    criticalStack.push(hasCriticalAnnotation(node, sourceText));
    loopDepthRef.value = 0;
  };
}

function makeExitFunction(criticalStack: boolean[], loopDepthRef: { value: number }) {
  return function exitFunction(): void {
    criticalStack.pop();
    loopDepthRef.value = 0;
  };
}

function makeEnterLoop(
  criticalStack: boolean[],
  loopDepthRef: { value: number },
  reportFn: (node: TSESTree.Node) => void
) {
  return function enterLoop(node: TSESTree.Node): void {
    if (criticalStack.length === 0 || criticalStack[criticalStack.length - 1] !== true) return;
    loopDepthRef.value++;
    if (loopDepthRef.value > 1) {
      reportFn(node);
    }
  };
}

function makeExitLoop(criticalStack: boolean[], loopDepthRef: { value: number }) {
  return function exitLoop(): void {
    if (criticalStack.length === 0 || criticalStack[criticalStack.length - 1] !== true) return;
    loopDepthRef.value--;
  };
}

export default createRule<[], MessageIds>({
  name: 'no-nested-loops-in-critical',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow nested loops in @perf-critical functions',
    },
    messages: {
      nestedLoopInCritical: 'Nested loop in @perf-critical code — consider alternative algorithm',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceText = context.sourceCode.getText();

    // Quick check: if the file has no @perf-critical at all, skip entirely
    if (!sourceText.includes('@perf-critical')) {
      return {};
    }

    // Stack tracks whether each nested function scope is @perf-critical
    const criticalStack: boolean[] = [];
    const loopDepthRef = { value: 0 };

    const reportNestedLoop = (node: TSESTree.Node): void => {
      context.report({ node, messageId: 'nestedLoopInCritical' });
    };

    const enterFunction = makeEnterFunction(criticalStack, loopDepthRef, sourceText);
    const exitFunction = makeExitFunction(criticalStack, loopDepthRef);
    const enterLoop = makeEnterLoop(criticalStack, loopDepthRef, reportNestedLoop);
    const exitLoop = makeExitLoop(criticalStack, loopDepthRef);

    return {
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      ForStatement: enterLoop,
      'ForStatement:exit': exitLoop,
      ForInStatement: enterLoop,
      'ForInStatement:exit': exitLoop,
      ForOfStatement: enterLoop,
      'ForOfStatement:exit': exitLoop,
      WhileStatement: enterLoop,
      'WhileStatement:exit': exitLoop,
      DoWhileStatement: enterLoop,
      'DoWhileStatement:exit': exitLoop,
    };
  },
});
