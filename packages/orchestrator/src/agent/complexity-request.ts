import type { Issue, RoutingTaskText } from '@harness-engineering/types';

/**
 * AMR live-classifier wiring: derive the PRE-DIFF text-only signals the
 * orchestrator actually knows about a unit at dispatch time, from an {@link
 * Issue}. This is the honest phase-aware input (S3-001): title/description
 * length + scope hints (spec attached, measurable acceptance) — NO fabricated
 * diff signals (blast-radius/filesTouched are undefined until a diff exists).
 *
 * Pure function; takes the Issue so the dispatch-site wiring is unit-testable
 * without instantiating an Orchestrator.
 */
export function buildTaskText(issue: Issue): RoutingTaskText {
  const title = issue.title ?? '';
  const description = issue.description ?? '';
  // The static pass's `descriptionLength` reference-normalizes against 500 chars;
  // title + description is the fullest cheap text signal available pre-diff.
  const combined = `${title}\n${description}`.trim();
  const descriptionLength = combined.length;

  // A spec file attached to the unit is a well-scoped signal (LOWERS complexity).
  const specExists = typeof issue.spec === 'string' && issue.spec.length > 0;

  return {
    descriptionLength,
    specExists,
    acceptanceMeasurable: detectMeasurableAcceptance(combined),
    // The tie-break prompt is the raw text; the LLM only sharpens level/confidence
    // (never the tier — that is always TS-derived, D3).
    prompt: combined,
  };
}

/**
 * Cheap heuristic for "acceptance criteria look measurable" — a well-scoped
 * signal that lowers effective complexity in the static pass. Looks for an
 * acceptance/success section AND at least one enumerated/checkbox item or a
 * numeric/measurable token. Deliberately conservative: a false negative only
 * costs a slightly-higher tier, never a wrong-but-confident cheap route.
 */
function detectMeasurableAcceptance(text: string): boolean {
  const lower = text.toLowerCase();
  const hasAcceptanceSection =
    /acceptance criteria|success criteria|definition of done|acceptance:/.test(lower);
  if (!hasAcceptanceSection) return false;
  // Enumerated list items, checkboxes, or a measurable/numeric token.
  const hasEnumeratedItems = /(^|\n)\s*(-|\*|\d+\.|\[[ xX]\])\s+\S/.test(text);
  const hasMeasurableToken = /\b\d+\s*(%|ms|s|tests?|cases?|files?)\b/.test(lower);
  return hasEnumeratedItems || hasMeasurableToken;
}
