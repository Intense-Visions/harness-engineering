// packages/core/src/fleet/claims/index.ts
//
// Barrel for the cross-run fleet work-claim lease
// (docs/changes/fleet-cross-run-claim-lease/proposal.md). Re-exports only:
// the lease primitives live in ./claim and the SELECT-phase helpers in
// ./select, which imports ./claim directly. Keeping code out of this file is
// what keeps the folder acyclic (#2695): select.ts used to import from here
// while this file re-exported select.ts.

export * from './claim';
export * from './select';
