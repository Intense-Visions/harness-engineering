/**
 * @harness-engineering/core — identity module.
 *
 * One identity engine (ULID generation + file-backed create-if-absent store +
 * completion-number allocator) consumed by session and worktree wirings.
 */
export { generateUlid, isValidUlid, ulidTime } from './ulid';
export { readIdentity, ensureIdentity, assignNumber, nextNumber } from './store';
// Collision-free alias for the core public barrel: `readIdentity` is already
// exported there by the telemetry module (install-identity) with a different
// return type, so cross-package consumers (e.g. the orchestrator) import the
// ULID reader under this unambiguous name.
export { readIdentity as readHarnessIdentity } from './store';
