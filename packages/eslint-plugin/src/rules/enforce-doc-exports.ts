// src/rules/enforce-doc-exports.ts
import { ESLintUtils } from '@typescript-eslint/utils';
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
    ) {
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

        if (decl.type === 'FunctionDeclaration' && decl.id) {
          checkExport(node, 'function', decl.id.name);
        } else if (decl.type === 'ClassDeclaration' && decl.id) {
          checkExport(node, 'class', decl.id.name);
        } else if (decl.type === 'VariableDeclaration') {
          for (const declarator of decl.declarations) {
            if (declarator.id.type === 'Identifier') {
              checkExport(node, 'variable', declarator.id.name);
            }
          }
        } else if (decl.type === 'TSTypeAliasDeclaration' && !options.ignoreTypes) {
          checkExport(node, 'type', decl.id.name);
        } else if (decl.type === 'TSInterfaceDeclaration' && !options.ignoreTypes) {
          checkExport(node, 'interface', decl.id.name);
        }
      },
    };
  },
});
