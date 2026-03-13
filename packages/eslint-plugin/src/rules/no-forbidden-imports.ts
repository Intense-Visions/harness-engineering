// src/rules/no-forbidden-imports.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { matchesPattern, resolveImportPath, normalizePath } from '../utils/path-utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'forbiddenImport';

export default createRule<[], MessageIds>({
  name: 'no-forbidden-imports',
  meta: {
    type: 'problem',
    docs: {
      description: 'Block forbidden imports based on configurable patterns',
    },
    messages: {
      forbiddenImport: '{{message}}',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.forbiddenImports?.length) {
      return {}; // No-op if no config
    }

    // Get file path relative to project
    const filePath = normalizePath(context.filename);

    // Find matching rules for this file
    const applicableRules = config.forbiddenImports.filter((rule) =>
      matchesPattern(filePath, rule.from)
    );

    if (applicableRules.length === 0) {
      return {}; // No rules apply to this file
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;
        const resolvedImport = resolveImportPath(importPath, context.filename);

        for (const rule of applicableRules) {
          for (const disallowed of rule.disallow) {
            // Check if import matches disallow pattern
            const isMatch =
              importPath === disallowed ||
              matchesPattern(resolvedImport, disallowed) ||
              matchesPattern(importPath, disallowed);

            if (isMatch) {
              context.report({
                node,
                messageId: 'forbiddenImport',
                data: {
                  message:
                    rule.message ||
                    `Import "${importPath}" is forbidden in files matching "${rule.from}"`,
                },
              });
              return; // Report once per import
            }
          }
        }
      },
    };
  },
});
