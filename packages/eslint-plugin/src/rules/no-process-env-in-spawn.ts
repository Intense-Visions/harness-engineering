// src/rules/no-process-env-in-spawn.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'processEnvInSpawn';

/**
 * Names of child_process functions that accept an options object with an `env`
 * property.  Passing `process.env` directly leaks every server-side secret to
 * the child process.
 */
const SPAWN_FUNCTIONS = new Set(['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork']);

/**
 * Returns the function name if `node` is a call to one of the spawn-family
 * functions (bare identifier or `child_process.spawn(...)` member expression).
 */
function getSpawnFunctionName(node: TSESTree.CallExpression): string | undefined {
  if (node.callee.type === 'Identifier' && SPAWN_FUNCTIONS.has(node.callee.name)) {
    return node.callee.name;
  }
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    SPAWN_FUNCTIONS.has(node.callee.property.name)
  ) {
    return node.callee.property.name;
  }
  return undefined;
}

/**
 * Returns true when `node` is the expression `process.env`.
 */
function isProcessEnv(node: TSESTree.Node): boolean {
  return (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'process' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'env'
  );
}

/**
 * Checks whether any property of an ObjectExpression sets `env: process.env`
 * or spreads `process.env` via `...process.env`.
 */
function hasProcessEnvProperty(node: TSESTree.ObjectExpression): TSESTree.Node | undefined {
  for (const prop of node.properties) {
    if (
      prop.type === 'Property' &&
      prop.key.type === 'Identifier' &&
      prop.key.name === 'env' &&
      isProcessEnv(prop.value)
    ) {
      return prop;
    }
    // Also catch `{ ...process.env }` as env spread
    if (prop.type === 'SpreadElement' && isProcessEnv(prop.argument)) {
      return prop;
    }
  }
  return undefined;
}

export default createRule<[], MessageIds>({
  name: 'no-process-env-in-spawn',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow passing process.env directly to spawn/execFile/fork, which leaks all server-side secrets to child processes',
    },
    messages: {
      processEnvInSpawn:
        "Do not pass process.env directly to '{{name}}'. Build an explicit env object with only the variables the child process needs.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const name = getSpawnFunctionName(node);
        if (!name) return;

        // spawn/execFile: options is typically the last argument (2nd or 3rd)
        // fork: options is the 2nd or 3rd argument
        // Check every ObjectExpression argument for `env: process.env`
        for (const arg of node.arguments) {
          if (arg.type === 'ObjectExpression') {
            const envProp = hasProcessEnvProperty(arg);
            if (envProp) {
              context.report({ node: envProp, messageId: 'processEnvInSpawn', data: { name } });
            }
          }
        }
      },
    };
  },
});
