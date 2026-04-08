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

    function getVariableExports(
      decl: TSESTree.VariableDeclaration
    ): Array<{ kind: string; name: string }> {
      return decl.declarations
        .filter((d) => (d.id.type as AST_NODE_TYPES) === AST_NODE_TYPES.Identifier)
        .map((d) => ({ kind: 'variable', name: (d.id as TSESTree.Identifier).name }));
    }

    function getExportInfo(decl: TSESTree.Node): Array<{ kind: string; name: string }> {
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
      if (declType === AST_NODE_TYPES.TSTypeAliasDeclaration && !options.ignoreTypes) {
        return [{ kind: 'type', name: (decl as TSESTree.TSTypeAliasDeclaration).id.name }];
      }
      if (declType === AST_NODE_TYPES.TSInterfaceDeclaration && !options.ignoreTypes) {
        return [{ kind: 'interface', name: (decl as TSESTree.TSInterfaceDeclaration).id.name }];
      }
      return [];
    }

    return {
      ExportNamedDeclaration(node) {
        const decl = node.declaration;
        if (!decl) return;

        for (const info of getExportInfo(decl)) {
          checkExport(node, info.kind, info.name);
        }
      },
    };
  },
});
