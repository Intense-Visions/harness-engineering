/**
 * Anatomy finding types.
 *
 * Codes are namespaced under three families (per ADR-002):
 *  - `ANAT-D*` definition findings (component definition omits a required part)
 *  - `ANAT-P*` pattern-presence findings (usage site omits a required affordance)
 *  - `ANAT-U*` usage findings (reserved for v2 — not emitted in v1)
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/proposal.md
 * (Decisions §2, "Technical Design" → "Data structures").
 */

/**
 * Anatomy finding code family.
 *
 * `ANAT-U*` is reserved in the type system for v2 even though no `ANAT-U*`
 * findings are emitted in v1 — the namespace is pre-declared so downstream
 * consumers (sub-project #4 verifier, sub-project #5 orchestrator) wire on
 * a stable contract.
 */
export type AnatomyFindingCode = `ANAT-D${string}` | `ANAT-P${string}` | `ANAT-U${string}`;

/** Severity tier emitted by the audit. */
export type Severity = 'error' | 'warn' | 'info';

/**
 * One finding emitted by the audit. Shape is stable — sub-projects #4 and #5
 * depend on it without further internal coupling.
 */
export interface AnatomyFinding {
  /** Stable finding identifier (e.g. `ANAT-D001`, `ANAT-P001`). */
  code: AnatomyFindingCode;
  /** Computed severity after the `design.strictness` × severityDefault matrix. */
  severity: Severity;
  /** Project-relative file path. */
  file: string;
  /** 1-indexed source line; `null` for whole-file definition findings. */
  line: number | null;
  /** Optional 1-indexed column. */
  column?: number;
  /** Resolved component type when identifiable (e.g. `Button`); `null` otherwise. */
  componentType: string | null;
  /** Human-readable message. */
  message: string;
  /** Optional snippet + context for human reading and graph evidence. */
  evidence: { snippet: string; contextLines?: string };
  /** Citation pair: finding code + authoritative source ref. */
  rule: { id: string; source: string };
  /** Manual fix hint or codemod-todo marker. */
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}
