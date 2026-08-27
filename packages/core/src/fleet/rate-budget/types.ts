// packages/core/src/fleet/rate-budget/types.ts
//
// Adopter-facing shape for a per-resource fan-out budget. The canonical
// definition lives in `@harness-engineering/types` (it is mirrored onto
// `AgentConfig.resourceBudgets`); re-exported here so the primitive and its
// config surface never drift.

export type { ResourceBudgetConfig } from '@harness-engineering/types';
