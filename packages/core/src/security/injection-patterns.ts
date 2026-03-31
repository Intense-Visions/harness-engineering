/**
 * Sentinel Injection Pattern Engine
 *
 * Shared pattern library for detecting prompt injection attacks in text input.
 * Used by sentinel hooks, MCP middleware, and the scan-config CLI.
 *
 * This engine DETECTS and REPORTS patterns. It does NOT strip them --
 * the existing sanitizeExternalText() in ConnectorUtils.ts handles stripping.
 */

export type InjectionSeverity = 'high' | 'medium' | 'low';

export interface InjectionFinding {
  severity: InjectionSeverity;
  ruleId: string;
  match: string;
  line?: number;
}

export interface InjectionPattern {
  ruleId: string;
  severity: InjectionSeverity;
  category: string;
  description: string;
  pattern: RegExp;
}

// --- HIGH severity patterns ---

const hiddenUnicodePatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-UNI-001',
    severity: 'high',
    category: 'hidden-unicode',
    description: 'Zero-width characters that can hide malicious instructions',
    pattern: /[\u200B\u200C\u200D\uFEFF\u2060]/,
  },
  {
    ruleId: 'INJ-UNI-002',
    severity: 'high',
    category: 'hidden-unicode',
    description: 'RTL/LTR override characters that can disguise text direction',
    pattern: /[\u202A-\u202E\u2066-\u2069]/,
  },
];

const reRolingPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-REROL-001',
    severity: 'high',
    category: 'explicit-re-roling',
    description: 'Instruction to ignore/disregard/forget previous instructions',
    pattern:
      /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|context|rules?|guidelines?)/i,
  },
  {
    ruleId: 'INJ-REROL-002',
    severity: 'high',
    category: 'explicit-re-roling',
    description: 'Attempt to reassign the AI role',
    pattern:
      /you\s+are\s+now\s+(?:a\s+)?(?:new\s+)?(?:helpful\s+)?(?:an?\s+)?/i,
  },
  {
    ruleId: 'INJ-REROL-003',
    severity: 'high',
    category: 'explicit-re-roling',
    description: 'Direct instruction override attempt',
    pattern:
      /(?:new\s+)?(?:system\s+)?(?:instruction|directive|role|persona)\s*[:=]\s*/i,
  },
];

// Placeholder: patterns for Task 2 and Task 3 will be added here

const ALL_PATTERNS: InjectionPattern[] = [
  ...hiddenUnicodePatterns,
  ...reRolingPatterns,
];

/**
 * Scan text for prompt injection patterns.
 *
 * Returns an array of findings sorted by severity (high first).
 * The caller decides how to act on findings based on severity:
 * - HIGH/MEDIUM: Trigger taint (hooks and MCP middleware)
 * - LOW: Informational only (logged to stderr, no taint)
 */
export function scanForInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  const lines = text.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]!;
    for (const rule of ALL_PATTERNS) {
      // Reset lastIndex for safety with reused RegExp objects
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        findings.push({
          severity: rule.severity,
          ruleId: rule.ruleId,
          match: line.trim(),
          line: lineIdx + 1,
        });
      }
    }
  }

  // Sort: high > medium > low
  const severityOrder: Record<InjectionSeverity, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return findings;
}

/**
 * Get all registered injection patterns.
 * Useful for inspection, documentation, and testing.
 */
export function getInjectionPatterns(): ReadonlyArray<InjectionPattern> {
  return ALL_PATTERNS;
}
