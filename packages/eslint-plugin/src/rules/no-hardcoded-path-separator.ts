// src/rules/no-hardcoded-path-separator.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'hardcodedPathSeparator';

// Matches strings containing /word/ patterns that look like path segments
// e.g., '/src/', '/dist/', '/build/', '/lib/', '/packages/'
const HARDCODED_SEPARATOR_PATTERN = /\/[a-zA-Z_][a-zA-Z0-9_-]*\//;

// URL prefixes to ignore
const URL_PREFIXES = ['http://', 'https://', 'ftp://', 'file://'];

// path.* methods that take path arguments
const PATH_METHODS = new Set([
  'join',
  'resolve',
  'normalize',
  'relative',
  'dirname',
  'basename',
  'extname',
  'parse',
  'format',
  'isAbsolute',
]);

// fs.* methods that take path arguments
const FS_METHODS = new Set([
  'readFileSync',
  'writeFileSync',
  'readFile',
  'writeFile',
  'existsSync',
  'exists',
  'statSync',
  'stat',
  'lstatSync',
  'lstat',
  'readdirSync',
  'readdir',
  'mkdirSync',
  'mkdir',
  'unlinkSync',
  'unlink',
  'rmSync',
  'rm',
  'cpSync',
  'cp',
  'copyFileSync',
  'copyFile',
  'renameSync',
  'rename',
  'accessSync',
  'access',
  'chmodSync',
  'chmod',
]);

// String methods that indicate path comparison/manipulation
const STRING_METHODS = new Set(['indexOf', 'includes', 'startsWith', 'endsWith']);

function isUrlString(value: string): boolean {
  return URL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isImportOrRequire(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // import '...' or import x from '...'
  if (parent.type === 'ImportDeclaration' && parent.source === node) return true;

  // import('...')
  if (parent.type === 'ImportExpression' && parent.source === node) return true;

  // require('...')
  if (
    parent.type === 'CallExpression' &&
    parent.callee.type === 'Identifier' &&
    parent.callee.name === 'require' &&
    parent.arguments[0] === node
  ) {
    return true;
  }

  return false;
}

function isInFlaggedContext(node: TSESTree.Literal): boolean {
  const parent = node.parent;
  if (!parent) return false;

  // Argument to a call expression
  if (parent.type === 'CallExpression') {
    const callee = parent.callee;

    // path.join(...), path.resolve(...), etc.
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      callee.object.name === 'path' &&
      callee.property.type === 'Identifier' &&
      PATH_METHODS.has(callee.property.name)
    ) {
      return true;
    }

    // fs.readFileSync(...), fs.writeFile(...), etc.
    if (
      callee.type === 'MemberExpression' &&
      callee.object.type === 'Identifier' &&
      (callee.object.name === 'fs' || callee.object.name === 'fsp') &&
      callee.property.type === 'Identifier' &&
      FS_METHODS.has(callee.property.name)
    ) {
      return true;
    }

    // str.indexOf(...), str.includes(...), etc.
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      STRING_METHODS.has(callee.property.name)
    ) {
      return true;
    }

    return false;
  }

  return false;
}

export default createRule<[], MessageIds>({
  name: 'no-hardcoded-path-separator',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow hardcoded Unix path separators in path/fs method calls and string comparisons',
    },
    messages: {
      hardcodedPathSeparator:
        'Avoid hardcoded Unix path separators. Use path.join(), path.sep, or path.posix/path.win32 for cross-platform compatibility.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Literal(node: TSESTree.Literal) {
        if (typeof node.value !== 'string') return;
        if (!HARDCODED_SEPARATOR_PATTERN.test(node.value)) return;
        if (isUrlString(node.value)) return;
        if (isImportOrRequire(node)) return;
        if (!isInFlaggedContext(node)) return;

        context.report({
          node,
          messageId: 'hardcodedPathSeparator',
        });
      },
    };
  },
});
