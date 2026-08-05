/**
 * Accessibility (ARIA) scanning types.
 *
 * Load-bearing mechanical check for the `a11y-aria-patterns` domain skill.
 * Mirrors the shape of the security rule engine (regex-per-line, confidence +
 * severity), but scoped to ARIA violations that are decidable from a single
 * element without data-flow or framework awareness. Deeper ARIA assertions
 * (accessible-name resolution, role-appropriate keyboard operability) remain
 * advisory in the skill because they cannot be enforced at low false-positive
 * rates with pattern matching alone.
 */

export type AriaSeverity = 'error' | 'warning' | 'info';
export type AriaConfidence = 'high' | 'medium' | 'low';

export interface AriaRule {
  /** Stable rule id, reusing the harness-accessibility A11Y-* taxonomy. */
  id: string;
  name: string;
  severity: AriaSeverity;
  confidence: AriaConfidence;
  patterns: RegExp[];
  message: string;
  remediation: string;
  /** WCAG success criterion / ARIA authoring-practices reference. */
  references?: string[];
}

export interface AriaFinding {
  ruleId: string;
  ruleName: string;
  severity: AriaSeverity;
  confidence: AriaConfidence;
  file: string;
  line: number;
  match: string;
  message: string;
  remediation: string;
  references?: string[];
}

export interface AriaScanResult {
  findings: AriaFinding[];
  scannedFiles: number;
  rulesApplied: number;
}

/** File extensions that can contain markup/JSX worth scanning for ARIA misuse. */
export const ARIA_SCANNABLE_EXTENSIONS: readonly string[] = [
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.html',
  '.htm',
];
