// src/rules/no-layer-violation.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig } from '../utils/config-loader';
import {
  resolveImportPath,
  getLayerForFile,
  getLayerByName,
  normalizePath,
} from '../utils/path-utils';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'layerViolation';

export default createRule<[], MessageIds>({
  name: 'no-layer-violation',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce layer boundary imports',
    },
    messages: {
      layerViolation: 'Layer "{{fromLayer}}" cannot import from layer "{{toLayer}}"',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const config = getConfig(context.filename);
    if (!config?.layers?.length) {
      return {}; // No-op if no layers configured
    }

    const filePath = normalizePath(context.filename);
    const currentLayer = getLayerForFile(filePath, config.layers);

    if (!currentLayer) {
      return {}; // File not in any layer
    }

    const currentLayerDef = getLayerByName(currentLayer, config.layers);
    if (!currentLayerDef) {
      return {};
    }

    function isLayerViolation(importLayer: string): boolean {
      return (
        importLayer !== currentLayer && !currentLayerDef.allowedDependencies.includes(importLayer)
      );
    }

    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        const importPath = node.source.value;
        if (!importPath.startsWith('.')) return;

        const resolvedImport = resolveImportPath(importPath, context.filename);
        const importLayer = getLayerForFile(resolvedImport, config.layers!);
        if (!importLayer) return;

        if (isLayerViolation(importLayer)) {
          context.report({
            node,
            messageId: 'layerViolation',
            data: { fromLayer: currentLayer, toLayer: importLayer },
          });
        }
      },
    };
  },
});
