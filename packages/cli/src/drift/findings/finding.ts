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

export type DriftFindingCode = `DRIFT-T${string}` | `DRIFT-P${string}`;
export type DriftSeverity = 'error' | 'warn' | 'info';
export type DriftStrictness = 'strict' | 'standard' | 'permissive';

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
 * Standard-mode severity defaults per code. Strict overrides all to
 * 'error'; permissive overrides all to 'info'.
 */
const STANDARD_SEVERITY: Record<string, DriftSeverity> = {
  'DRIFT-T001': 'error', // hex outside palette — high-impact brand integrity
  'DRIFT-T002': 'error', // font outside palette — high-impact brand integrity
  'DRIFT-T003': 'warn', // pixel margin outside scale — lower stakes
  'DRIFT-T004': 'warn', // deprecated token — migration nudge
  'DRIFT-P001': 'error', // raw <button> where Button registered
  'DRIFT-P002': 'warn', // raw <input>/<textarea> where Input/Textarea registered
  'DRIFT-P003': 'warn', // raw <a> where Link/Anchor registered
  'DRIFT-P004': 'warn', // raw <textarea> where Textarea registered
};

/**
 * Map a finding code to a severity given the project's strictness.
 */
export function severityFor(code: DriftFindingCode, strictness: DriftStrictness): DriftSeverity {
  if (strictness === 'permissive') return 'info';
  if (strictness === 'strict') return 'error';
  return STANDARD_SEVERITY[code] ?? 'warn';
}
