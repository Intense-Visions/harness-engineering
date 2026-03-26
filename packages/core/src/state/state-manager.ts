// packages/core/src/state/state-manager.ts
// Barrel re-export for backward compatibility.
// The implementation has been split into focused domain files.

export { loadState, saveState } from './state-persistence';
export { clearLearningsCache, appendLearning, loadRelevantLearnings } from './learnings';
export { clearFailuresCache, appendFailure, loadFailures, archiveFailures } from './failures';
export { saveHandoff, loadHandoff } from './handoff';
export { runMechanicalGate } from './mechanical-gate';
