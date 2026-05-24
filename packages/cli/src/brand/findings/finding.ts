/**
 * Brand finding types — emitted by audit-brand-compliance.
 *
 * Code namespace:
 *   BRAND-T*  — token misuse (token used in $extensions.harness.brand.forbidden_contexts)
 *   BRAND-V*  — voice rule violations (string literals containing forbidden phrases)
 *
 * Severity is derived from design.strictness:
 *   strict      → all findings 'error'
 *   standard    → T001 = 'error'; V001 = 'warn'
 *   permissive  → all 'info'
 *
 * Source: docs/changes/design-pipeline/audit-brand-compliance/proposal.md
 *   (Outputs → BrandFinding).
 */

export type BrandFindingCode = `BRAND-T${string}` | `BRAND-V${string}`;
export type BrandSeverity = 'error' | 'warn' | 'info';
export type BrandStrictness = 'strict' | 'standard' | 'permissive';

export interface BrandFinding {
  code: BrandFindingCode;
  severity: BrandSeverity;
  file: string;
  line: number | null;
  column?: number;
  message: string;
  evidence: { snippet: string };
  rule: { id: string; category: 'token-misuse' | 'voice' };
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}

const STANDARD_SEVERITY: Record<string, BrandSeverity> = {
  'BRAND-T001': 'error', // explicit declaration that this token MUST NOT be used here
  'BRAND-V001': 'warn', // copy nuance — some matches may be intentional edge cases
};

export function severityFor(code: BrandFindingCode, strictness: BrandStrictness): BrandSeverity {
  if (strictness === 'permissive') return 'info';
  if (strictness === 'strict') return 'error';
  return STANDARD_SEVERITY[code] ?? 'warn';
}
