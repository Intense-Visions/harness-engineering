// src/rules/index.ts
import enforceDocExports from './enforce-doc-exports';
import noCircularDeps from './no-circular-deps';
import noForbiddenImports from './no-forbidden-imports';
import noLayerViolation from './no-layer-violation';
import requireBoundarySchema from './require-boundary-schema';

export const rules = {
  'enforce-doc-exports': enforceDocExports,
  'no-circular-deps': noCircularDeps,
  'no-forbidden-imports': noForbiddenImports,
  'no-layer-violation': noLayerViolation,
  'require-boundary-schema': requireBoundarySchema,
};
