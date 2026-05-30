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
import {
  defaultSeverityForCode,
  resolveSeverity,
  type DesignStrictness,
} from '../findings/severity.js';
import type { ConventionRule } from './convention-rule.js';

/**
 * Static map: (componentType, slot.name) → finding code.
 *
 * Phase 2 catalog expansion extends this map per the finding-codes.md
 * range allocation. Current assignments:
 *   - ANAT-D001 — Button.content      (Phase 1 vertical slice)
 *   - ANAT-D004 — Input.label         (Phase 2 catalog expansion: first
 *                                      Tier-1 critical for Input; primary
 *                                      a11y deferral overlap with A11Y-050)
 *   - ANAT-D005 — Dialog.title        (Phase 2 catalog expansion: first
 *                                      Tier-1 critical for Dialog; primary
 *                                      a11y deferral overlap with A11Y-010,
 *                                      same three-satisfier shape as
 *                                      Input.label)
 *   - ANAT-D006 — Select.label        (Phase 2 catalog expansion: first
 *                                      Tier-1 critical for Select; claims
 *                                      ANAT-D006 from the D006–D009
 *                                      "Input/Select overflow" reserved
 *                                      band; same three-satisfier shape
 *                                      as Input.label / Dialog.title)
 *   - ANAT-D020 — EmptyState.headline (Phase 2 catalog expansion: first
 *                                      Tier-1 critical for EmptyState;
 *                                      sourced from Open UI rather than
 *                                      APG since EmptyState is not an
 *                                      interactive ARIA pattern)
 *
 * Remaining Tier-1 codes in D004–D029 are assigned in landing order as
 * Phase 2 conventions ship per the finding-codes.md reservation table.
 *
 * When a required slot lacks a mapped code the runner skips it (does
 * not emit a finding) rather than fabricate a synthetic code — keeps
 * the code namespace authoritative.
 */
const slotFindingCodes: Record<string, Record<string, AnatomyFindingCode>> = {
  Button: {
    content: 'ANAT-D001',
  },
  Input: {
    label: 'ANAT-D004',
  },
  Dialog: {
    title: 'ANAT-D005',
  },
  Select: {
    label: 'ANAT-D006',
  },
  EmptyState: {
    headline: 'ANAT-D020',
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

  if (componentType === 'Input' && slotName === 'label') {
    // Per finding-codes.md ANAT-D004 satisfiability: any of `label` prop,
    // `aria-label` prop, or `aria-labelledby` prop. Authors who route
    // labelling through an external `<label htmlFor>` element must wire
    // it via `aria-labelledby` to be visible to the audit (and to a11y
    // tools generally) — the audit deliberately does not inspect call
    // sites for v1 (the ANAT-U* call-site family is reserved for v2).
    return (
      memberSet.has('label') || memberSet.has('aria-label') || memberSet.has('aria-labelledby')
    );
  }

  if (componentType === 'Dialog' && slotName === 'title') {
    // Per finding-codes.md ANAT-D005 satisfiability: any of `title` prop,
    // `aria-label` prop, or `aria-labelledby` prop. Same three-satisfier
    // shape as ANAT-D004 (Input.label) — APG dialog-modal mandates the
    // accessible name via aria-labelledby (pointing at a visible heading)
    // or aria-label when no visible label exists; libraries surface this
    // ergonomically as a `title` prop.
    return (
      memberSet.has('title') || memberSet.has('aria-label') || memberSet.has('aria-labelledby')
    );
  }

  if (componentType === 'Select' && slotName === 'label') {
    // Per finding-codes.md ANAT-D006 satisfiability: any of `label` prop,
    // `aria-label` prop, or `aria-labelledby` prop. Same three-satisfier
    // shape as ANAT-D004 (Input.label) — APG `listbox` mandates the
    // accessible name on the control; libraries surface this as a `label`
    // prop ergonomically. Note: `placeholder` is NOT a satisfier (APG
    // explicitly warns that placeholder text is not the field's label).
    return (
      memberSet.has('label') || memberSet.has('aria-label') || memberSet.has('aria-labelledby')
    );
  }

  if (componentType === 'EmptyState' && slotName === 'headline') {
    // Per finding-codes.md ANAT-D020 satisfiability: any of `title` prop,
    // `headline` prop, or `children` (the headline rendered as the first
    // text child). Names only — Phase 1 satisfiability stance matches
    // ANAT-D001 and ANAT-D004 (no type-compatibility check on `children`
    // — its presence as a typed member is sufficient).
    return memberSet.has('title') || memberSet.has('headline') || memberSet.has('children');
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
 *                  - `filePath`        — finding.file value (defaults to '').
 *                  - `strictness`      — `design.strictness` from harness.config.json
 *                                        used to compute final severity via the
 *                                        full strictness × default-severity matrix.
 *                  - `severityFor`     — caller-supplied severity resolver. When
 *                                        provided, supersedes both `strictness`
 *                                        and the built-in default — used by
 *                                        tests and callers with custom matrices.
 *                  - `runId`           — currently unused; reserved for
 *                                        sub-project #4 fixpoint detection.
 */
export function runConventionRule(
  rule: ConventionRule,
  parsed: ParsedComponent,
  options?: {
    filePath?: string;
    strictness?: DesignStrictness;
    severityFor?: (code: AnatomyFindingCode) => Severity;
  }
): AnatomyFinding[] {
  const findings: AnatomyFinding[] = [];
  const filePath = options?.filePath ?? '';
  const strictness = options?.strictness;
  const severityFor =
    options?.severityFor ??
    ((code: AnatomyFindingCode) => resolveSeverity(defaultSeverityForCode(code), strictness));

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
