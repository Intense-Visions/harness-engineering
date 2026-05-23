/**
 * Convention rule runner — executes a ConventionRule against a parsed
 * component definition and emits `ANAT-D*` findings for missing
 * required parts.
 *
 * Scope (Phase 1 vertical slice):
 *   Required-SLOT checks for the Button convention. Only the `content`
 *   slot maps to a concrete finding code (ANAT-D001) in the MVP. Other
 *   Button required parts (focus state ANAT-D002, default state
 *   ANAT-D003) need richer analysis (className / control-flow walks)
 *   and land in follow-up tasks; the runner skips them here rather
 *   than emitting false positives.
 *
 * Code allocation per finding-codes.md:
 *   ANAT-D001 — Button: missing required `content` slot
 *
 * Source: docs/changes/design-pipeline/audit-component-anatomy/finding-codes.md
 *   (Tier-1 critical: required-slot missing band D001–D029)
 */

import type { ParsedComponent } from '../parsers/ast.js';
import type { AnatomyFinding, AnatomyFindingCode, Severity } from '../findings/finding.js';
import type { ConventionRule } from './convention-rule.js';

/**
 * Static map: (componentType, slot.name) → finding code.
 *
 * Phase-1-vertical-slice scope — only Button slots are wired. Phase 2
 * catalog expansion extends this map per the finding-codes.md range
 * allocation (D004–D009 and D016–D019 reserved for Button overflow,
 * D010–D015 for Tabs, D020–D029 for EmptyState, etc.).
 *
 * When a required slot lacks a mapped code the runner skips it (does
 * not emit a finding) rather than fabricate a synthetic code — keeps
 * the code namespace authoritative.
 */
const slotFindingCodes: Record<string, Record<string, AnatomyFindingCode>> = {
  Button: {
    content: 'ANAT-D001',
  },
};

/**
 * Satisfiability check: does the parsed prop-type include a member
 * that satisfies the slot?
 *
 * For ANAT-D001 (Button content slot) the finding-codes.md "Schema
 * notes" enumerate the satisfying members:
 *   - `children`     (typed as React.ReactNode / ReactNode / string)
 *   - `label`        (typed as string)
 *   - `aria-label`   (typed as string)
 *
 * Phase 1 vertical slice matches on member NAMES only — type
 * compatibility (string vs. ReactNode) is deferred to Phase 2. This is
 * adequate for the MVP: the failure mode the audit catches is "prop
 * named neither children/label/aria-label exists", which is purely a
 * name check.
 */
function isSlotSatisfied(
  componentType: string,
  slotName: string,
  propTypeMembers: string[]
): boolean {
  const memberSet = new Set(propTypeMembers);

  if (componentType === 'Button' && slotName === 'content') {
    return memberSet.has('children') || memberSet.has('label') || memberSet.has('aria-label');
  }

  // Fallback: exact-name match. Future slots can register specialised
  // satisfiability rules above; until then, presence of a member with
  // the slot's exact name is considered satisfaction.
  return memberSet.has(slotName);
}

/**
 * Run a convention rule against a parsed component. Returns the list
 * of findings (empty when all required slots are satisfied or when the
 * runner has no code allocated for any unsatisfied slot).
 *
 * @param rule    The ConventionRule for the component's type.
 * @param parsed  Output of `parseComponentDefinition`.
 * @param options Optional overrides:
 *                  - `filePath`       — finding.file value (defaults to '').
 *                  - `severityFor`    — override severity per code (defaults
 *                                       to `error` for Tier-1 D001–D029).
 *                  - `runId`          — currently unused; reserved for
 *                                       sub-project #4 fixpoint detection.
 */
export function runConventionRule(
  rule: ConventionRule,
  parsed: ParsedComponent,
  options?: {
    filePath?: string;
    severityFor?: (code: AnatomyFindingCode) => Severity;
  }
): AnatomyFinding[] {
  const findings: AnatomyFinding[] = [];
  const filePath = options?.filePath ?? '';
  const severityFor = options?.severityFor ?? defaultSeverityForCode;

  const componentCodes = slotFindingCodes[rule.componentType];

  for (const slot of rule.slots) {
    if (!slot.required) continue;
    if (isSlotSatisfied(rule.componentType, slot.name, parsed.propTypeMembers)) continue;

    const code = componentCodes?.[slot.name];
    if (!code) {
      // No allocated code for this slot — Phase 2 will fill it in.
      continue;
    }

    findings.push({
      code,
      severity: severityFor(code),
      file: filePath,
      line: null,
      componentType: rule.componentType,
      message:
        `${rule.componentType} definition is missing the required \`${slot.name}\` slot. ` +
        `Resolved exported component: \`${parsed.exportName}\`.`,
      evidence: {
        snippet: `(no \`${slot.name}\`-satisfying member in prop type: [${parsed.propTypeMembers.join(', ')}])`,
      },
      rule: {
        id: code,
        source: rule.source.ref,
      },
      fix: {
        kind: 'manual',
        description: slot.fixHint,
      },
    });
  }

  return findings;
}

/**
 * Default severity table per the finding-codes.md tier-band allocation
 * at `standard` strictness:
 *   - D001–D029 → error
 *   - D030–D099 → warn
 *   - D100–D199 → info
 *   - D000      → info (authoring guidance, not promoted by strictness)
 * All other codes default to `warn`.
 *
 * Sprint 3 ships the full strictness × tier matrix in
 * `findings/severity.ts`; this MVP function is the trivial subset
 * needed by the vertical slice.
 */
function defaultSeverityForCode(code: AnatomyFindingCode): Severity {
  const match = /^ANAT-D(\d{3})$/.exec(code);
  if (match) {
    const n = Number(match[1]);
    if (n === 0) return 'info';
    if (n >= 1 && n <= 29) return 'error';
    if (n >= 30 && n <= 99) return 'warn';
    if (n >= 100 && n <= 199) return 'info';
  }
  return 'warn';
}
