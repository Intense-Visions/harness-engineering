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
    // eslint-disable-next-line no-misleading-character-class -- intentional: regex detects zero-width chars for security scanning
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
      /you\s+are\s+now\s+(?:a\s+|an\s+)?(?:new\s+)?(?:helpful\s+)?(?:my\s+)?(?:\w+\s+)?(?:assistant|agent|AI|bot|chatbot|system|persona)\b/i,
  },
  {
    ruleId: 'INJ-REROL-003',
    severity: 'high',
    category: 'explicit-re-roling',
    description: 'Direct instruction override attempt',
    // Requires an override verb (new/override/replace/set/reassign/reset/switch/update/change)
    // before the keyword so plain documentation headings like `_Agent & Persona:_` or YAML
    // keys like `role: developer` do not trigger. Real overrides ("new system instruction:",
    // "override directive:", "set role: admin") still match.
    pattern:
      /(?:new|override|replace|set|reassign|reset|switch(?:\s+to)?|update|change)\s+(?:system\s+)?(?:instruction|directive|role|persona)s?\s*[:=]\s*/i,
  },
];

const permissionEscalationPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-PERM-001',
    severity: 'high',
    category: 'permission-escalation',
    description: 'Attempt to enable all tools or grant unrestricted access',
    pattern: /(?:allow|enable|grant)\s+all\s+(?:tools?|permissions?|access)/i,
  },
  {
    ruleId: 'INJ-PERM-002',
    severity: 'high',
    category: 'permission-escalation',
    description: 'Attempt to disable safety or security features',
    pattern:
      /(?:disable|turn\s+off|remove|bypass)\s+(?:all\s+)?(?:safety|security|restrictions?|guardrails?|protections?|checks?)/i,
  },
  {
    ruleId: 'INJ-PERM-003',
    severity: 'high',
    category: 'permission-escalation',
    description: 'Auto-approve directive that bypasses human review',
    pattern: /(?:auto[- ]?approve|--no-verify|--dangerously-skip-permissions)/i,
  },
];

const encodedPayloadPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-ENC-001',
    severity: 'high',
    category: 'encoded-payloads',
    description: 'Base64-encoded string long enough to contain instructions (>=28 chars)',
    // Match base64 strings of 28+ chars (7+ groups of 4).
    // Excludes JWT tokens (eyJ prefix) and Bearer-prefixed tokens.
    pattern:
      /(?<!Bearer\s)(?<![:])(?<![A-Za-z0-9/])(?!eyJ)(?:[A-Za-z0-9+/]{4}){7,}(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?(?![A-Za-z0-9/])/,
  },
  {
    ruleId: 'INJ-ENC-002',
    severity: 'high',
    category: 'encoded-payloads',
    description: 'Hex-encoded string long enough to contain directives (>=20 hex chars)',
    // Excludes hash-prefixed hex (sha256:, sha512:, md5:, etc.) and hex preceded by 0x.
    // Note: 40-char git SHA hashes (e.g. in `git log` output) may match — downstream
    // callers should filter matches of exactly 40 hex chars if scanning git output.
    pattern: /(?<![:x])(?<![A-Fa-f0-9])(?:[0-9a-fA-F]{2}){10,}(?![A-Fa-f0-9])/,
  },
];

// --- MEDIUM severity patterns ---

const indirectInjectionPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-IND-001',
    severity: 'medium',
    category: 'indirect-injection',
    description: 'Instruction to influence future responses',
    pattern:
      /(?:when\s+the\s+user\s+asks|if\s+(?:the\s+user|someone|anyone)\s+asks)\s*,?\s*(?:say|respond|reply|answer|tell)/i,
  },
  {
    ruleId: 'INJ-IND-002',
    severity: 'medium',
    category: 'indirect-injection',
    description: 'Directive to include content in responses',
    pattern:
      /(?:include|insert|add|embed|put)\s+(?:this|the\s+following)\s+(?:in|into|to)\s+(?:your|the)\s+(?:response|output|reply|answer)/i,
  },
  {
    ruleId: 'INJ-IND-003',
    severity: 'medium',
    category: 'indirect-injection',
    description: 'Standing instruction to always respond a certain way',
    pattern: /always\s+(?:respond|reply|answer|say|output)\s+(?:with|that|by)/i,
  },
];

const contextManipulationPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-CTX-001',
    severity: 'medium',
    category: 'context-manipulation',
    description: 'Claim about system prompt content',
    pattern:
      /(?:the\s+)?(?:system\s+prompt|system\s+message|hidden\s+instructions?)\s+(?:says?|tells?|instructs?|contains?|is)/i,
  },
  {
    ruleId: 'INJ-CTX-002',
    severity: 'medium',
    category: 'context-manipulation',
    description: 'Claim about AI instructions',
    pattern: /your\s+(?:instructions?|directives?|guidelines?|rules?)\s+(?:are|say|tell|state)/i,
  },
  {
    ruleId: 'INJ-CTX-003',
    severity: 'medium',
    category: 'context-manipulation',
    description: 'Fake XML/HTML system or instruction tags',
    // Case-sensitive: only match lowercase tags to avoid false positives on
    // React components like <User>, <Context>, <Role> etc.
    pattern:
      /<\/?(?:system|instruction|prompt|role|context|tool_call|function_call|assistant|human|user)[^>]*>/,
  },
  {
    ruleId: 'INJ-CTX-004',
    severity: 'medium',
    category: 'context-manipulation',
    description: 'Fake JSON role assignment mimicking chat format',
    pattern: /[{,]\s*"role"\s*:\s*"(?:system|assistant|function)"/i,
  },
];

const socialEngineeringPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-SOC-001',
    severity: 'medium',
    category: 'social-engineering',
    description: 'Urgency pressure to bypass checks',
    pattern:
      /(?:this\s+is\s+(?:very\s+)?urgent|this\s+is\s+(?:an?\s+)?emergency|do\s+(?:this|it)\s+(?:now|immediately))\b/i,
  },
  {
    ruleId: 'INJ-SOC-002',
    severity: 'medium',
    category: 'social-engineering',
    description: 'False authority claim',
    pattern:
      /(?:the\s+)?(?:admin|administrator|manager|CEO|CTO|owner|supervisor)\s+(?:authorized|approved|said|told|confirmed|requested)/i,
  },
  {
    ruleId: 'INJ-SOC-003',
    severity: 'medium',
    category: 'social-engineering',
    description: 'Testing pretext to bypass safety',
    pattern: /(?:for\s+testing\s+purposes?|this\s+is\s+(?:just\s+)?a\s+test|in\s+test\s+mode)\b/i,
  },
];

// --- LOW severity patterns ---

const suspiciousPatterns: InjectionPattern[] = [
  {
    ruleId: 'INJ-SUS-001',
    severity: 'low',
    category: 'suspicious-patterns',
    description: 'Excessive consecutive whitespace (>10 chars) mid-line that may hide content',
    // Only match whitespace runs not at the start of a line (indentation is normal)
    pattern: /\S\s{11,}/,
  },
  {
    ruleId: 'INJ-SUS-002',
    severity: 'low',
    category: 'suspicious-patterns',
    description: 'Repeated delimiters (>5) that may indicate obfuscation',
    pattern: /([|;,=\-_~`])\1{5,}/,
  },
  {
    ruleId: 'INJ-SUS-003',
    severity: 'low',
    category: 'suspicious-patterns',
    description: 'Mathematical alphanumeric symbols used as Latin character substitutes',
    // Mathematical bold/italic/script Unicode ranges (U+1D400-U+1D7FF)
    pattern: /[\uD835][\uDC00-\uDFFF]/,
  },
];

const ALL_PATTERNS: InjectionPattern[] = [
  ...hiddenUnicodePatterns,
  ...reRolingPatterns,
  ...permissionEscalationPatterns,
  ...encodedPayloadPatterns,
  ...indirectInjectionPatterns,
  ...contextManipulationPatterns,
  ...socialEngineeringPatterns,
  ...suspiciousPatterns,
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

/**
 * Bash command patterns that are blocked during tainted sessions.
 * Used by sentinel hooks and MCP middleware — kept in one place to prevent drift.
 * Hooks that cannot import from core at startup define their own inline copy with a sync comment.
 */
export const DESTRUCTIVE_BASH: ReadonlyArray<RegExp> = [
  /\bgit\s+push\b/,
  /\bgit\s+commit\b/,
  /\brm\s+-rf?\b/,
  /\brm\s+-r\b/,
];
