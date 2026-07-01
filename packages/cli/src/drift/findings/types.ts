/**
 * Pure type contracts shared between the drift finding emitter
 * (`findings/finding.ts`) and the code catalog (`catalog/index.ts`).
 *
 * These live in their own import-free module so the catalog can describe
 * its entries in terms of the finding codes without importing back from
 * `finding.ts` (which imports `lookupDriftCode` from the catalog). Keeping
 * the shared types here breaks that type-only import cycle while leaving
 * `finding.ts` as the stable public surface (it re-exports these).
 */

export type DriftFindingCode = `DRIFT-T${string}` | `DRIFT-P${string}`;
export type DriftSeverity = 'error' | 'warn' | 'info';
export type DriftStrictness = 'strict' | 'standard' | 'permissive';
