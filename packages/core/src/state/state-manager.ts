// packages/core/src/state/state-manager.ts
// Barrel re-export for backward compatibility.
// The implementation has been split into focused domain files.

export { loadState, saveState } from './state-persistence';
export {
  clearLearningsCache,
  appendLearning,
  loadRelevantLearnings,
  loadBudgetedLearnings,
  parseDateFromEntry,
  analyzeLearningPatterns,
  archiveLearnings,
  pruneLearnings,
  promoteSessionLearnings,
  countLearningEntries,
  parseFrontmatter,
  extractIndexEntry,
} from './learnings';
export { clearFailuresCache, appendFailure, loadFailures, archiveFailures } from './failures';
export { saveHandoff, loadHandoff } from './handoff';
export { runMechanicalGate } from './mechanical-gate';
export { resolveSessionDir, updateSessionIndex } from './session-resolver';
export {
  readSessionSections,
  readSessionSection,
  appendSessionEntry,
  updateSessionEntryStatus,
} from './session-sections';
export { archiveSession } from './session-archive';
