export {
  GoldenConfigSchema,
  GoldenFileEntrySchema,
  GoldenSnapshotSchema,
  GoldenFileChangeSchema,
  GoldenDiffResultSchema,
  DEFAULT_GOLDEN_REFERENCE_PATHS,
  DEFAULT_GOLDEN_MANIFEST_PATH,
} from './types';

export type {
  GoldenConfig,
  GoldenFileEntry,
  GoldenSnapshot,
  GoldenFileChange,
  GoldenDiffResult,
} from './types';

export { GoldenBuildManager } from './manager';
export type { GoldenProvenance } from './manager';
