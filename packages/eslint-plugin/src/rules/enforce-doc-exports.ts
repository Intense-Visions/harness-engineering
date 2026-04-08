// src/rules/enforce-doc-exports.ts
import { ESLintUtils, AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { hasJSDocComment, isMarkedInternal } from '../utils/ast-helpers';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type Options = [
  {
    ignoreTypes?: boolean;
    ignoreInternal?: boolean;
  },
];

type MessageIds = 'missingJSDoc';

function getVariableExports(decl: TSESTree.VariableDeclaration): Array<{ kind: string; name: string }> {
  return decl.declarations
    .filter((d) => (d.id.type as AST_NODE_TYPES) === AST_NODE_TYPES.Identifier)
    .map((d) => ({ kind: 'variable', name: (d.id as TSESTree.Identifier).name }));
}

function getExportInfo(
  decl: TSESTree.Node,
  ignoreTypes: boolean
): Array<{ kind: string; name: string }> {
  const declType = decl.type as AST_NODE_TYPES;
  if (declType === AST_NODE_TYPES.FunctionDeclaration) {
    const fn = decl as TSESTree.FunctionDeclaration;
    return fn.id ? [{ kind: 'function', name: fn.id.name }] : [];
  }
  if (declType === AST_NODE_TYPES.ClassDeclaration) {
    const cls = decl as TSESTree.ClassDeclaration;
    return cls.id ? [{ kind: 'class', name: cls.id.name }] : [];
  }
  if (declType === AST_NODE_TYPES.VariableDeclaration) {
    return getVariableExports(decl as TSESTree.VariableDeclaration);
  }
  if (declType === AST_NODE_TYPES.TSTypeAliasDeclaration && !ignoreTypes) {
    return [{ kind: 'type', name: (decl as TSESTree.TSTypeAliasDeclaration).id.name }];
  }
  if (declType === AST_NODE_TYPES.TSInterfaceDeclaration && !ignoreTypes) {
    return [{ kind: 'interface', name: (decl as TSESTree.TSInterfaceDeclaration).id.name }];
  }
  return [];
}

type ReportFn = (opts: {
  node: TSESTree.Node;
  messageId: MessageIds;
  data: Record<string, string>;
}) => void;

function checkExportNode(
  node: Parameters<typeof hasJSDocComment>[0],
  kind: string,
  name: string,
  sourceCode: string,
  ignoreInternal: boolean,
  report: ReportFn
): void {
  if (ignoreInternal && isMarkedInternal(node, sourceCode)) return;
  if (!hasJSDocComment(node, sourceCode)) {
    report({ node, messageId: 'missingJSDoc', data: { kind, name } });
  }
}

function handleExportNamedDeclaration(
  node: TSESTree.ExportNamedDeclaration,
  ignoreTypes: boolean,
  sourceCode: string,
  ignoreInternal: boolean,
  report: ReportFn
): void {
  const decl = node.declaration;
  if (!decl) return;
  for (const info of getExportInfo(decl, ignoreTypes)) {
    checkExportNode(node, info.kind, info.name, sourceCode, ignoreInternal, report);
  }
}

export default createRule<Options, MessageIds>({
  name: 'enforce-doc-exports',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require JSDoc comments on public exports',
    },
    messages: {
      missingJSDoc: 'Exported {{kind}} "{{name}}" is missing JSDoc documentation',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreTypes: { type: 'boolean', default: false },
          ignoreInternal: { type: 'boolean', default: true },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ ignoreTypes: false, ignoreInternal: true }],
  create(context, [options]) {
    const sourceCode = context.sourceCode.getText();
    const ignoreTypes = options.ignoreTypes ?? false;
    const ignoreInternal = options.ignoreInternal ?? true;
    const report = context.report.bind(context) as ReportFn;

    return {
      ExportNamedDeclaration(node) {
        handleExportNamedDeclaration(node, ignoreTypes, sourceCode, ignoreInternal, report);
      },
    };
  },
});
