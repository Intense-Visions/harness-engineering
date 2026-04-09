// src/rules/no-forbidden-imports.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import { matchesPattern, resolveImportPath, normalizePath } from '../utils/path-utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'forbiddenImport';

interface ForbiddenImportRule {
  from: string;
  disallow: string[];
  message?: string | undefined;
}

function importMatchesDisallowed(
  importPath: string,
  resolvedImport: string,
  disallowed: string
): boolean {
  return (
    importPath === disallowed ||
    matchesPattern(resolvedImport, disallowed) ||
    matchesPattern(importPath, disallowed)
  );
}

function findViolatedRule(
  applicableRules: ForbiddenImportRule[],
  importPath: string,
  resolvedImport: string
): ForbiddenImportRule | undefined {
  for (const rule of applicableRules) {
    for (const disallowed of rule.disallow) {
      if (importMatchesDisallowed(importPath, resolvedImport, disallowed)) {
        return rule;
      }
    }
  }
  return undefined;
}

function buildForbiddenMessage(rule: ForbiddenImportRule, importPath: string): string {
  return rule.message ?? `Import "${importPath}" is forbidden in files matching "${rule.from}"`;
}

function checkImportDeclaration(
  node: TSESTree.ImportDeclaration,
  applicableRules: ForbiddenImportRule[],
  filename: string,
  report: (opts: {
    node: TSESTree.Node;
    messageId: MessageIds;
    data: Record<string, string>;
  }) => void
): void {
  const importPath = node.source.value;
  const resolvedImport = resolveImportPath(importPath, filename);
  const violatedRule = findViolatedRule(applicableRules, importPath, resolvedImport);
  if (violatedRule) {
    report({
      node,
      messageId: 'forbiddenImport',
      data: { message: buildForbiddenMessage(violatedRule, importPath) },
    });
  }
}

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

    const filePath = normalizePath(context.filename);
    const applicableRules = config.forbiddenImports.filter((rule) =>
      matchesPattern(filePath, rule.from)
    );

    if (applicableRules.length === 0) {
      return {}; // No rules apply to this file
    }

    const report = context.report.bind(context) as (opts: {
      node: TSESTree.Node;
      messageId: MessageIds;
      data: Record<string, string>;
    }) => void;

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        checkImportDeclaration(node, applicableRules, context.filename, report);
      },
    };
  },
});
