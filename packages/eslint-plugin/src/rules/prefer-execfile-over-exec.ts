// src/rules/prefer-execfile-over-exec.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'preferExecFile';

// Object identifiers that mark a member call as coming from child_process
// rather than, e.g., a RegExp (`myRegex.exec(str)`). Used only to disambiguate
// the overloaded `.exec` member — `.execSync` has no such collision.
const CHILD_PROCESS_ALIASES = new Set(['child_process', 'childProcess', 'cp', 'child']);

// The first argument spawns a shell when it is a string command. Presence of a
// string/template first argument is what matters — not its contents.
function isStringCommand(arg: TSESTree.CallExpressionArgument | undefined): boolean {
  if (!arg) return false;
  if (arg.type === 'Literal' && typeof arg.value === 'string') return true;
  if (arg.type === 'TemplateLiteral') return true;
  return false;
}

// Returns 'exec' | 'execSync' when the call is a child_process shell invocation
// that should prefer the execFile* form, otherwise undefined.
//
// - `execSync` is unambiguous (RegExp has no execSync): flag bare and member forms.
// - bare `exec(...)` is treated as the destructured child_process import.
// - member `X.exec(...)` is flagged ONLY when X is a known child_process alias,
//   which excludes the dominant `RegExp.prototype.exec` member call.
function getExecFunctionName(node: TSESTree.CallExpression): 'exec' | 'execSync' | undefined {
  const { callee } = node;

  if (callee.type === 'Identifier') {
    if (callee.name === 'exec' || callee.name === 'execSync') return callee.name;
    return undefined;
  }

  if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
    const method = callee.property.name;
    if (method === 'execSync') return 'execSync';
    if (
      method === 'exec' &&
      callee.object.type === 'Identifier' &&
      CHILD_PROCESS_ALIASES.has(callee.object.name)
    ) {
      return 'exec';
    }
  }

  return undefined;
}

export default createRule<[], MessageIds>({
  name: 'prefer-execfile-over-exec',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer execFile/execFileSync with an argument array over exec/execSync with a string command.',
    },
    messages: {
      preferExecFile:
        'Prefer execFile/execFileSync with an argument array over {{fn}} with a string command — the string form spawns a shell (injection surface) and mishandles exit codes with shell operators like && or >.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const fn = getExecFunctionName(node);
        if (!fn) return;
        if (!isStringCommand(node.arguments[0])) return;
        context.report({ node, messageId: 'preferExecFile', data: { fn } });
      },
    };
  },
});
