// src/rules/require-boundary-schema.ts
import { ESLintUtils, AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { matchesPattern, normalizePath } from '../utils/path-utils';
import { hasZodValidation } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'missingSchema';

function extractFunctionDeclaration(
  node: TSESTree.ExportNamedDeclaration
): TSESTree.FunctionDeclaration | null {
  const decl = node.declaration;
  if (!decl || (decl.type as AST_NODE_TYPES) !== AST_NODE_TYPES.FunctionDeclaration) {
    return null;
  }
  const fn = decl as TSESTree.FunctionDeclaration;
  if (!fn.id || !fn.body) return null;
  return fn;
}

function isFileInBoundary(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(filePath, pattern));
}

function checkBoundaryExport(
  node: TSESTree.ExportNamedDeclaration,
  report: (opts: {
    node: TSESTree.Node;
    messageId: MessageIds;
    data: Record<string, string>;
  }) => void
): void {
  const fn = extractFunctionDeclaration(node);
  if (!fn) return;
  if (!hasZodValidation(fn.body)) {
    report({ node: fn, messageId: 'missingSchema', data: { name: fn.id!.name } });
  }
}

export default createRule<[], MessageIds>({
  name: 'require-boundary-schema',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require Zod schema validation at API boundaries',
    },
    messages: {
      missingSchema:
        'Exported function "{{name}}" at API boundary must validate input with Zod schema',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.boundaries?.requireSchema?.length) {
      return {}; // No-op if no boundaries configured
    }

    const filePath = normalizePath(context.filename);

    if (!isFileInBoundary(filePath, config.boundaries.requireSchema)) {
      return {}; // Not a boundary file
    }

    const report = context.report.bind(context) as (opts: {
      node: TSESTree.Node;
      messageId: MessageIds;
      data: Record<string, string>;
    }) => void;

    return {
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        checkBoundaryExport(node, report);
      },
    };
  },
});
