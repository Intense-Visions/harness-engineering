// src/rules/no-unix-shell-command.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'unixShellCommand';

const UNIX_COMMANDS = ['rm', 'cp', 'mv', 'mkdir', 'chmod', 'chown'];

// Match unix commands at the start of the string or after whitespace/shell operators
// Also matches full-path invocations like /bin/rm or /usr/bin/cp
const UNIX_COMMAND_PATTERN = new RegExp(
  `(?:^|[;&|]\\s*)(?:/(?:usr/)?(?:bin|sbin)/)?(?:${UNIX_COMMANDS.join('|')})(?:\\s|$)`
);

// Only flag exec() and execSync() — NOT execFile/execFileSync
const FLAGGED_FUNCTIONS = new Set(['exec', 'execSync']);

function getFlaggedFunctionName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === 'Identifier' && FLAGGED_FUNCTIONS.has(node.callee.name)) {
    return node.callee.name;
  }
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    FLAGGED_FUNCTIONS.has(node.callee.property.name)
  ) {
    return node.callee.property.name;
  }
  return undefined;
}

function isFlaggedCall(node: TSESTree.CallExpression): boolean {
  return getFlaggedFunctionName(node) !== undefined;
}

function extractCommandString(
  arg: TSESTree.CallExpressionArgument | undefined
): string | undefined {
  if (!arg) return undefined;
  if (arg.type === 'Literal' && typeof arg.value === 'string') {
    return arg.value;
  }
  if (arg.type === 'TemplateLiteral' && arg.quasis.length > 0) {
    return arg.quasis.map((q) => q.value.raw).join(' ');
  }
  return undefined;
}

export default createRule<[], MessageIds>({
  name: 'no-unix-shell-command',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow exec/execSync calls with Unix-specific shell commands',
    },
    messages: {
      unixShellCommand:
        'Avoid Unix-specific shell commands in exec/execSync. Use Node.js fs APIs or execFile with cross-platform binaries instead.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        if (!isFlaggedCall(node)) return;

        const commandString = extractCommandString(node.arguments[0]);
        if (commandString && UNIX_COMMAND_PATTERN.test(commandString)) {
          context.report({ node, messageId: 'unixShellCommand' });
        }
      },
    };
  },
});
