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

interface LayerDef {
  name: string;
  pattern: string;
  allowedDependencies: string[];
}

function isLayerViolation(
  importLayer: string,
  currentLayer: string,
  currentLayerDef: LayerDef
): boolean {
  return importLayer !== currentLayer && !currentLayerDef.allowedDependencies.includes(importLayer);
}

function resolveImportLayer(
  importPath: string,
  filename: string,
  layers: LayerDef[]
): string | null {
  if (!importPath.startsWith('.')) return null;
  const resolvedImport = resolveImportPath(importPath, filename);
  return getLayerForFile(resolvedImport, layers) ?? null;
}

type RuleContext = Parameters<ReturnType<typeof createRule<[], MessageIds>>['create']>[0];

function checkLayerImport(
  node: TSESTree.ImportDeclaration,
  context: RuleContext,
  currentLayer: string,
  currentLayerDef: LayerDef,
  layers: LayerDef[]
): void {
  const importLayer = resolveImportLayer(node.source.value, context.filename, layers);
  if (!importLayer) return;
  if (isLayerViolation(importLayer, currentLayer, currentLayerDef)) {
    context.report({
      node,
      messageId: 'layerViolation',
      data: { fromLayer: currentLayer, toLayer: importLayer },
    });
  }
}

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

    const layers = config.layers;
    return {
      ImportDeclaration(node: TSESTree.ImportDeclaration) {
        checkLayerImport(node, context, currentLayer, currentLayerDef, layers);
      },
    };
  },
});
