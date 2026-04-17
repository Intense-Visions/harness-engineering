// packages/core/src/annotations/index.ts

export type {
  ProtectionScope,
  ProtectedRegion,
  ProtectedRegionMap,
  AnnotationIssue,
  AnnotationIssueType,
} from './types';

export { VALID_SCOPES } from './types';

export { parseProtectedRegions, parseFileRegions, createRegionMap } from './protected-regions';
