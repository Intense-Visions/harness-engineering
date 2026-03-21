export {
  createFixes,
  previewFix,
  applyFixes,
  createCommentedCodeFixes,
  createOrphanedDepFixes,
} from './safe-fixes';
export type { CommentedCodeBlock, OrphanedDep } from './safe-fixes';
export { generateSuggestions } from './suggestions';
export { createForbiddenImportFixes } from './architecture-fixes';
export type { ForbiddenImportViolation } from './architecture-fixes';
export {
  classifyFinding,
  applyHotspotDowngrade,
  deduplicateCleanupFindings,
} from './cleanup-finding';
