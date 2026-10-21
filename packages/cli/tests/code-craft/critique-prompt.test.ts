/**
 * Byte-identity anchors for `buildPrompt` (spec criterion 4, second half).
 *
 * Criterion 4 promises that a unit belonging to NO clone class renders a prompt
 * "byte-identical to the pre-change prompt". Before Phase 5 that half had no
 * guard at all: no test in this directory called `buildPrompt`. An
 * unfalsifiable claim is exactly the vacuous-test pattern this feature has
 * shipped seven times, so the two literals below were captured by running
 * `buildPrompt` against UNMODIFIED `src/` at commit f3c5dc904, BEFORE any
 * Phase 5 change to `phases/critique.ts`.
 *
 * EDITING EITHER LITERAL TO MAKE A TEST PASS DEFEATS THE CRITERION IT EXISTS
 * FOR. If a prompt change is intended, change it deliberately, re-capture, and
 * say so in the commit — the anchor is the record that the change was a
 * decision rather than a drift.
 *
 * One anchor per gate side: CODE-R004 is the only member of
 * `SIBLING_AWARE_RUBRIC_IDS`, and CODE-R001 is a rubric outside it, so the two
 * literals together pin both branches of the rubric gate.
 *
 * Source: docs/changes/duplication-detection/proposal.md (Phase 5).
 */

import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/code-craft/phases/critique';
import { abstractionEarnsKeepRubric } from '../../src/code-craft/catalog/rubrics/abstraction-earns-keep';
import { revealsIntentRubric } from '../../src/code-craft/catalog/rubrics/reveals-intent';
import type { CodeUnit } from '../../src/code-craft/findings/schema';

const SOURCE = `export function classify(x: number): string {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
`;

const UNIT: CodeUnit = { kind: 'function', name: 'classify', line: 1, endLine: 7 };

/** Reused by every case in this file and by the sibling-aware cases below. */
const BASE = { file: 'packages/cli/src/demo.ts', source: SOURCE, unit: UNIT } as const;

/** Captured at f3c5dc904 against unmodified src. Do not edit to pass a test. */
const PROMPT_CODE_R004_NO_SIBLINGS = `Rubric: Abstraction earns its keep (CODE-R004)
Source: Ousterhout, A Philosophy of Software Design (deep vs shallow modules) + Fowler, Refactoring (Rule of Three)
Description: A good abstraction is deep: its interface is much simpler than the machinery it hides, so the caller carries less than the author did. Ask: does this unit pull its weight, or is it a shallow pass-through whose signature is as complex as its body (a wrapper that forwards every argument, a class with one method that could be a function)? Is it premature — an abstraction invented for a single caller, a config object with one field, an interface with one implementation and no second on the horizon? Conversely, is a genuine concept missing — the same five lines copied in three places crying out for one named home (Rule of Three)? Watch for: leaky abstractions that force the caller to understand the internals anyway; indirection that adds a hop without hiding anything. The bar: the abstraction should reduce, not relocate, the reader’s cognitive load.

File: packages/cli/src/demo.ts
Unit: kind=function, name=classify, line=1

Code unit under review:
\`\`\`
export function classify(x: number): string {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
\`\`\`

Respond with a fenced JSON block. Either:
- \`null\` (literal) if the rubric does not apply OR the unit already clears this bar, OR
- \`{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique naming the specific construct and a concrete suggested revision>" }\`

Remember the confidence policy: medium by default; high requires a specific quotable construct.`;

/** Captured at f3c5dc904 against unmodified src. Do not edit to pass a test. */
const PROMPT_CODE_R001_NO_SIBLINGS = `Rubric: Reveals intent — reads in the domain’s language (CODE-R001)
Source: Beck, Implementation Patterns (intention-revealing code) + Fowler, Refactoring (2e)
Description: Great code reads like a description of the problem in the domain’s own vocabulary — a reader reconstructs WHY, not just WHAT. Ask: does this unit speak in the concepts a domain expert would recognize, or in incidental machinery (loops, indices, flags, generic "data"/"item"/"result")? Would a reader who knows the domain but not this file understand what problem it solves without running it? Watch for: business rules buried in anonymous conditionals; magic numbers/strings with no named meaning; a comment that apologizes for code that should have said it itself; steps that could be a well-named helper but are inlined so the intent is lost in the mechanics. This is about the code telling its story, NOT about individual identifier quality (naming-craft owns identifier-level critique).

File: packages/cli/src/demo.ts
Unit: kind=function, name=classify, line=1

Code unit under review:
\`\`\`
export function classify(x: number): string {
  if (x > 10) {
    return 'big';
  }
  const doubled = x * 2;
  return doubled > 5 ? 'medium' : 'small';
}
\`\`\`

Respond with a fenced JSON block. Either:
- \`null\` (literal) if the rubric does not apply OR the unit already clears this bar, OR
- \`{ "tier": "foundational|polish|aspirational", "impact": "small|medium|large", "confidence": "high|medium|low", "message": "<critique naming the specific construct and a concrete suggested revision>" }\`

Remember the confidence policy: medium by default; high requires a specific quotable construct.`;

describe('buildPrompt byte-identity anchors (criterion 4, second half)', () => {
  it('CODE-R004 with no sibling fields renders the pre-change prompt exactly', () => {
    expect(buildPrompt({ ...BASE, rubric: abstractionEarnsKeepRubric })).toBe(
      PROMPT_CODE_R004_NO_SIBLINGS
    );
  });

  it('CODE-R001 with no sibling fields renders the pre-change prompt exactly', () => {
    expect(buildPrompt({ ...BASE, rubric: revealsIntentRubric })).toBe(
      PROMPT_CODE_R001_NO_SIBLINGS
    );
  });

  // Guards the anchors against a vacuous pass: a literal that had silently lost
  // its body (empty string, or the head without the fenced-JSON tail) would
  // still satisfy the two `toBe` assertions above, because both sides would be
  // whatever `buildPrompt` returns. These assert the anchor itself still
  // carries the structure the byte-identity claim is about.
  it('each anchor carries the full prompt structure it claims to pin', () => {
    for (const anchor of [PROMPT_CODE_R004_NO_SIBLINGS, PROMPT_CODE_R001_NO_SIBLINGS]) {
      expect(anchor.split('\n')).toHaveLength(23);
      expect(anchor).toContain('Code unit under review:');
      expect(anchor).toContain('Respond with a fenced JSON block. Either:');
      expect(anchor).toContain('Remember the confidence policy');
      expect(anchor).toContain('const doubled = x * 2;');
    }
    expect(PROMPT_CODE_R004_NO_SIBLINGS).toContain('CODE-R004');
    expect(PROMPT_CODE_R001_NO_SIBLINGS).toContain('CODE-R001');
    // The anchors must differ, or one of them is pinning the wrong rubric.
    expect(PROMPT_CODE_R004_NO_SIBLINGS).not.toBe(PROMPT_CODE_R001_NO_SIBLINGS);
  });
});
