// src/rules/require-boundary-schema.ts
import { ESLintUtils, AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { matchesPattern, normalizePath } from '../utils/path-utils';
import { hasZodValidation } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'missingSchema';

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

    // Check if file matches any boundary pattern
    const isBoundaryFile = config.boundaries.requireSchema.some((pattern) =>
      matchesPattern(filePath, pattern)
    );

    if (!isBoundaryFile) {
      return {}; // Not a boundary file
    }

    return {
      ExportNamedDeclaration(node: TSESTree.ExportNamedDeclaration) {
        const decl = node.declaration;

        // Only check function declarations
        if (!decl || (decl.type as AST_NODE_TYPES) !== AST_NODE_TYPES.FunctionDeclaration) {
          return;
        }

        const fn = decl as TSESTree.FunctionDeclaration;
        if (!fn.id || !fn.body) return;

        // Check if function has Zod validation
        if (!hasZodValidation(fn.body)) {
          context.report({
            node: fn,
            messageId: 'missingSchema',
            data: { name: fn.id.name },
          });
        }
      },
    };
  },
});
