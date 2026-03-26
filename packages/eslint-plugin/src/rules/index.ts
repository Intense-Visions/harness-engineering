// src/rules/index.ts
import enforceDocExports from './enforce-doc-exports';
import noCircularDeps from './no-circular-deps';
import noForbiddenImports from './no-forbidden-imports';
import noLayerViolation from './no-layer-violation';
import noNestedLoopsInCritical from './no-nested-loops-in-critical';
import noSyncIoInAsync from './no-sync-io-in-async';
import noUnboundedArrayChains from './no-unbounded-array-chains';
import requireBoundarySchema from './require-boundary-schema';
import noUnixShellCommand from './no-unix-shell-command';
import noHardcodedPathSeparator from './no-hardcoded-path-separator';
import requirePathNormalization from './require-path-normalization';

export const rules = {
  'enforce-doc-exports': enforceDocExports,
  'no-circular-deps': noCircularDeps,
  'no-forbidden-imports': noForbiddenImports,
  'no-hardcoded-path-separator': noHardcodedPathSeparator,
  'no-layer-violation': noLayerViolation,
  'no-nested-loops-in-critical': noNestedLoopsInCritical,
  'no-sync-io-in-async': noSyncIoInAsync,
  'no-unbounded-array-chains': noUnboundedArrayChains,
  'no-unix-shell-command': noUnixShellCommand,
  'require-boundary-schema': requireBoundarySchema,
  'require-path-normalization': requirePathNormalization,
};
