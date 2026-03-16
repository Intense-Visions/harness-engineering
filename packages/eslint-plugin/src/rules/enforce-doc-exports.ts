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

    function checkExport(
      node: Parameters<typeof hasJSDocComment>[0],
      kind: string,
      name: string
    ): void {
      // Skip if marked @internal and ignoreInternal is true
      if (options.ignoreInternal && isMarkedInternal(node, sourceCode)) {
        return;
      }

      if (!hasJSDocComment(node, sourceCode)) {
        context.report({
          node,
          messageId: 'missingJSDoc',
          data: { kind, name },
        });
      }
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        const declType = decl.type as AST_NODE_TYPES;
        if (declType === AST_NODE_TYPES.FunctionDeclaration) {
          const fn = decl as TSESTree.FunctionDeclaration;
          if (fn.id) checkExport(node, 'function', fn.id.name);
        } else if (declType === AST_NODE_TYPES.ClassDeclaration) {
          const cls = decl as TSESTree.ClassDeclaration;
          if (cls.id) checkExport(node, 'class', cls.id.name);
        } else if (declType === AST_NODE_TYPES.VariableDeclaration) {
          const varDecl = decl as TSESTree.VariableDeclaration;
          for (const declarator of varDecl.declarations) {
            if ((declarator.id.type as AST_NODE_TYPES) === AST_NODE_TYPES.Identifier) {
              checkExport(node, 'variable', (declarator.id as TSESTree.Identifier).name);
            }
          }
        } else if (declType === AST_NODE_TYPES.TSTypeAliasDeclaration && !options.ignoreTypes) {
          const typeAlias = decl as TSESTree.TSTypeAliasDeclaration;
          checkExport(node, 'type', typeAlias.id.name);
        } else if (declType === AST_NODE_TYPES.TSInterfaceDeclaration && !options.ignoreTypes) {
          const iface = decl as TSESTree.TSInterfaceDeclaration;
          checkExport(node, 'interface', iface.id.name);
        }
      },
    };
  },
});
