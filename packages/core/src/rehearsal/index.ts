/**
 * rehearsal: deliberately-broken fixtures + deterministic recovery scoring.
 *
 * Fixtures live in `templates/rehearsal-fixtures/`; each plants one failure mode
 * that a real harness check catches. The scorer grades a structured recovery
 * record against a fixture manifest with no IO and no LLM, so a known-good and a
 * known-bad recovery map to stable, testable scores.
 */
export * from './types';
export { REHEARSAL_WEIGHTS, rehearsalTierFor, scoreRecovery } from './scoring';
export { MANIFEST_FILENAME, loadManifest, loadCatalog, findFixture } from './catalog';
