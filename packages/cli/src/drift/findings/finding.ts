/**
 * Drift finding types — emitted by detect-design-drift (design-pipeline #1).
 *
 * Code namespace:
 *   DRIFT-T*  — token bypass (hardcoded values where tokens exist)
 *   DRIFT-P*  — primitive adoption (raw HTML where component is registered)
 *
 * Severity is derived from `design.strictness`:
 *   strict      → all findings 'error'
 *   standard    → T001/T002/P001 = 'error'; T003/T004/P002-P004 = 'warn'
 *   permissive  → all 'info'
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Technical Design → Data structures).
 */

import { lookupDriftCode } from '../catalog/index.js';

// Shared type contracts live in ./types.ts (import-free) so the catalog can
// reference the finding codes without importing back from this module.
export type { DriftFindingCode, DriftSeverity, DriftStrictness } from './types.js';
import type { DriftFindingCode, DriftSeverity, DriftStrictness } from './types.js';

export interface DriftFinding {
  code: DriftFindingCode;
  severity: DriftSeverity;
  file: string;
  line: number | null;
  column?: number;
  message: string;
  evidence: { snippet: string; contextLines?: string };
  rule: { id: string; category: 'token-bypass' | 'primitive-adoption' };
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}

/**
 * Map a finding code to a severity given the project's strictness.
 *
 * Standard-mode severities live in `../catalog/index.ts` as the
 * single source of truth. This function reads from there so the
 * inline severity table and the public catalog cannot drift.
 */
export function severityFor(code: DriftFindingCode, strictness: DriftStrictness): DriftSeverity {
  if (strictness === 'permissive') return 'info';
  if (strictness === 'strict') return 'error';
  const entry = lookupDriftCode(code);
  return entry !== null ? entry.standardSeverity : 'warn';
}
