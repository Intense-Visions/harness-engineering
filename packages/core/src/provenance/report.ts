/**
 * Rule-to-failure provenance reporter (ADR 0100).
 *
 * Joins the two provenance sides — enforced rules (each with an optional
 * `origin` back-pointer) and `harness-compound` solution docs (each with an
 * optional `enforces:` forward-pointer) — and surfaces two advisory flags:
 *
 *   (a) unexplained constraint  — an enforced rule with no origin and not
 *       claimed by any solution's `enforces`. "Why does this rule exist?"
 *       cannot be answered mechanically.
 *   (b) candidate dead rule     — a link that no longer resolves: a rule whose
 *       `origin` points at no known solution (obsoleted?), or a solution that
 *       `enforces` a STRENGTH rule id absent from the registry (the rule it
 *       hardened is gone).
 *
 * This is advisory metadata, never a gate — the reporter reports; it never
 * fails. Authority stays with the existing enforcement gates.
 */

/** The rule side of the join: a rule id and its optional origin back-pointer. */
export interface RuleProvenanceInput {
  id: string;
  /** Solution slug or issue ref this rule was born from. Absent = unexplained. */
  origin?: string;
}

/** The solution side of the join: a solution slug and the rule ids it enforces. */
export interface SolutionEnforcement {
  /** Slug relative to docs/solutions, no extension (e.g. `bug-track/logic-errors/foo`). */
  slug: string;
  /** Rule identifiers this solution produced or hardened. */
  enforces: string[];
}

export interface UnexplainedConstraint {
  ruleId: string;
}

export type DeadRuleReason = 'origin-unresolved' | 'enforced-rule-missing';

export interface DeadRuleCandidate {
  reason: DeadRuleReason;
  /** The rule id in question (the unresolved-origin rule, or the missing enforced id). */
  ruleId: string;
  /** Present for `enforced-rule-missing`: the solution that references the absent rule. */
  slug?: string;
  detail: string;
}

export interface ProvenanceReport {
  totalRules: number;
  totalSolutions: number;
  /** Rules explained by an origin or by some solution's `enforces`. */
  explainedRules: number;
  unexplained: UnexplainedConstraint[];
  deadRuleCandidates: DeadRuleCandidate[];
}

/** STRENGTH-* is the id shape of the typed rule registry this reporter joins against. */
const STRENGTH_RULE_ID = /^STRENGTH-\d+$/i;

/** Issue references (`#1469`, `1469`) and URLs resolve outside docs/solutions. */
function isIssueOrUrlRef(origin: string): boolean {
  return /^#?\d+$/.test(origin) || /^https?:\/\//i.test(origin);
}

/** Does `origin` name a known solution — by full slug, trailing segment, or basename? */
function matchesSolution(origin: string, slugs: string[]): boolean {
  return slugs.some(
    (slug) => slug === origin || slug.endsWith(`/${origin}`) || slug.split('/').pop() === origin
  );
}

/** (b) A rule whose slug-shaped origin resolves to no known solution doc. */
function unresolvedOriginCandidate(
  rule: RuleProvenanceInput,
  slugs: string[]
): DeadRuleCandidate | null {
  const origin = rule.origin?.trim() ?? '';
  if (origin === '' || isIssueOrUrlRef(origin) || matchesSolution(origin, slugs)) return null;
  return {
    reason: 'origin-unresolved',
    ruleId: rule.id,
    detail: `origin "${origin}" resolves to no known solution doc (obsoleted?)`,
  };
}

/**
 * (b) Solutions enforcing a STRENGTH rule id no longer in the registry.
 * Non-STRENGTH ids (arch:, sec:, generated baseline rules) are outside the
 * typed registry's scope and are not flagged — avoids false positives.
 */
function missingEnforcedRuleCandidates(
  solutions: SolutionEnforcement[],
  ruleIds: Set<string>
): DeadRuleCandidate[] {
  const out: DeadRuleCandidate[] = [];
  for (const s of solutions) {
    for (const id of s.enforces) {
      if (!STRENGTH_RULE_ID.test(id) || ruleIds.has(id)) continue;
      out.push({
        reason: 'enforced-rule-missing',
        ruleId: id,
        slug: s.slug,
        detail: `solution "${s.slug}" enforces "${id}", which is not a registered rule`,
      });
    }
  }
  return out;
}

export function buildProvenanceReport(
  rules: RuleProvenanceInput[],
  solutions: SolutionEnforcement[]
): ProvenanceReport {
  const ruleIds = new Set(rules.map((r) => r.id));
  const slugs = solutions.map((s) => s.slug);

  const enforcedBySolution = new Set<string>();
  for (const s of solutions) for (const id of s.enforces) enforcedBySolution.add(id);

  const unexplained: UnexplainedConstraint[] = [];
  const deadRuleCandidates: DeadRuleCandidate[] = [];
  let explainedRules = 0;

  for (const rule of rules) {
    const explained = (rule.origin?.trim() ?? '') !== '' || enforcedBySolution.has(rule.id);
    if (explained) explainedRules++;
    else unexplained.push({ ruleId: rule.id });

    const candidate = unresolvedOriginCandidate(rule, slugs);
    if (candidate) deadRuleCandidates.push(candidate);
  }

  deadRuleCandidates.push(...missingEnforcedRuleCandidates(solutions, ruleIds));

  return {
    totalRules: rules.length,
    totalSolutions: solutions.length,
    explainedRules,
    unexplained,
    deadRuleCandidates,
  };
}
