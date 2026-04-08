// src/rules/no-nested-loops-in-critical.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'nestedLoopInCritical';

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
    let loopDepth = 0;

    function isCritical(): boolean {
      return criticalStack.length > 0 && criticalStack[criticalStack.length - 1] === true;
    }

    function getAnnotationTarget(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ): TSESTree.Node {
      const parentType = node.parent?.type;
      if (parentType === 'ExportNamedDeclaration' || parentType === 'VariableDeclaration') {
        return node.parent as TSESTree.Node;
      }
      return node;
    }

    function hasCriticalAnnotation(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ): boolean {
      const target = getAnnotationTarget(node);
      const startLine = target.loc.start.line; // 1-indexed
      const lines = sourceText.split('\n');
      for (let i = Math.max(0, startLine - 2); i < startLine; i++) {
        if (lines[i]?.includes('@perf-critical')) return true;
      }
      return false;
    }

    function enterFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression
    ) {
      criticalStack.push(hasCriticalAnnotation(node));
      loopDepth = 0;
    }

    function exitFunction() {
      criticalStack.pop();
      loopDepth = 0;
    }

    function enterLoop(node: TSESTree.Node) {
      if (!isCritical()) return;
      loopDepth++;
      if (loopDepth > 1) {
        context.report({ node, messageId: 'nestedLoopInCritical' });
      }
    }

    function exitLoop() {
      if (!isCritical()) return;
      loopDepth--;
    }

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
