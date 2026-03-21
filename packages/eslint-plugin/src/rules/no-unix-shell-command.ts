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
        let functionName: string | undefined;

        // Handle: exec('...')  / execSync('...')
        if (node.callee.type === 'Identifier' && FLAGGED_FUNCTIONS.has(node.callee.name)) {
          functionName = node.callee.name;
        }

        // Handle: child_process.exec('...')  / child_process.execSync('...')
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          FLAGGED_FUNCTIONS.has(node.callee.property.name)
        ) {
          functionName = node.callee.property.name;
        }

        if (!functionName) return;

        const firstArg = node.arguments[0];
        if (!firstArg) return;

        let commandString: string | undefined;

        if (firstArg.type === 'Literal' && typeof firstArg.value === 'string') {
          commandString = firstArg.value;
        } else if (firstArg.type === 'TemplateLiteral' && firstArg.quasis.length > 0) {
          // Check all static segments of the template literal
          commandString = firstArg.quasis.map((q) => q.value.raw).join(' ');
        }

        if (commandString && UNIX_COMMAND_PATTERN.test(commandString)) {
          context.report({
            node,
            messageId: 'unixShellCommand',
          });
        }
      },
    };
  },
});
