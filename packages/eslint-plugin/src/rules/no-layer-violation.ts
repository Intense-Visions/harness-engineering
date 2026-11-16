// src/rules/no-layer-violation.ts
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import { getConfig, getConfigRoot } from '../utils/config-loader';
import {
  resolveImportPath,
  getLayerForFile,
  getLayerByName,
  normalizePath,
} from '../utils/path-utils';
import { resolveWorkspaceImport } from '../utils/workspace-packages';

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/harness-engineering/eslint-plugin/blob/main/docs/rules/${name}.md`
);

type MessageIds = 'layerViolation';

interface RuleOptions {
  /**
   * Resolve bare specifiers naming a workspace package (`@scope/pkg`,
   * `@scope/pkg/sub`) to that package's source and check them against the
   * layer config. Off by default: bare specifiers are ignored.
   */
  resolveWorkspacePackages?: boolean;
}

type Options = [RuleOptions];

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
  layers: LayerDef[],
  projectRoot: string | null,
  resolveWorkspacePackages: boolean
): string | null {
  if (!importPath.startsWith('.')) {
    if (!resolveWorkspacePackages || !projectRoot) return null;
    const target = resolveWorkspaceImport(importPath, projectRoot);
    if (!target) return null;
    return getLayerForFile(normalizePath(target, projectRoot), layers) ?? null;
  }
  const resolvedImport = resolveImportPath(importPath, filename, projectRoot ?? undefined);
  return getLayerForFile(resolvedImport, layers) ?? null;
}

type RuleContext = Parameters<ReturnType<typeof createRule<Options, MessageIds>>['create']>[0];

function checkLayerImport(
  node: TSESTree.ImportDeclaration,
  context: RuleContext,
  currentLayer: string,
  currentLayerDef: LayerDef,
  layers: LayerDef[],
  projectRoot: string | null,
  resolveWorkspacePackages: boolean
): void {
  const importLayer = resolveImportLayer(
    node.source.value,
    context.filename,
    layers,
    projectRoot,
    resolveWorkspacePackages
  );
  if (!importLayer) return;
  if (isLayerViolation(importLayer, currentLayer, currentLayerDef)) {
    context.report({
      node,
      messageId: 'layerViolation',
      data: { fromLayer: currentLayer, toLayer: importLayer },
    });
  }
}

export default createRule<Options, MessageIds>({
  name: 'no-layer-violation',
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce layer boundary imports',
    },
    messages: {
      layerViolation: 'Layer "{{fromLayer}}" cannot import from layer "{{toLayer}}"',
    },
    schema: [
      {
        type: 'object',
        properties: {
          resolveWorkspacePackages: {
            type: 'boolean',
            description:
              'Resolve bare workspace-package specifiers (and subpath exports) to package source and enforce layer boundaries across packages.',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ resolveWorkspacePackages: false }],
  create(context, [options]) {
    const resolveWorkspacePackages = options.resolveWorkspacePackages === true;
    const config = getConfig(context.filename);
    if (!config?.layers?.length) {
      return {}; // No-op if no layers configured
    }

    const projectRoot = getConfigRoot(context.filename);
    const filePath = normalizePath(context.filename, projectRoot ?? undefined);
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
        checkLayerImport(
          node,
          context,
          currentLayer,
          currentLayerDef,
          layers,
          projectRoot,
          resolveWorkspacePackages
        );
      },
    };
  },
});
