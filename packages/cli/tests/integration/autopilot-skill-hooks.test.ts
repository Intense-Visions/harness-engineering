// packages/cli/tests/integration/autopilot-skill-hooks.test.ts
//
// #1481 (generalized) — the narrow `review.additionalSkills` seam became the
// general cross-skill `skillHooks` lifecycle-hook framework. harness-autopilot
// is the flagship consumer. autopilot + harness-code-review are prose-driven,
// so the contract lives in their SKILL.md. Assertions are loose on wording but
// strict on: the general framework is documented, the three hook kinds exist,
// the review case is wired at after:REVIEW + after:FINAL_REVIEW, a non-review
// event (before:EXECUTE) is wired, on:failure is wired, an unresolvable hook is
// a hard halt (not a silent skip), and the second consumer declares a hook.
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { CRAFT_REVIEW_EVENTS_BY_HOST } from '@harness-engineering/core';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const AUTOPILOT_SKILL_MD = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'harness-autopilot',
  'SKILL.md'
);
const CODE_REVIEW_SKILL_MD = path.join(
  REPO_ROOT,
  'agents',
  'skills',
  'claude-code',
  'harness-code-review',
  'SKILL.md'
);

/** Extract from a `### <heading>` (heading given verbatim) to the next `###`/`##`/`---`. */
function extractSection(md: string, headingStartsWith: string): string {
  const lines = md.split('\n');
  const start = lines.findIndex(
    (l) => l.startsWith('### ') && l.slice(4).startsWith(headingStartsWith)
  );
  if (start === -1) throw new Error(`Section starting "${headingStartsWith}" not found`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('### ') || lines[i].startsWith('## ') || lines[i] === '---') {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

describe('harness-autopilot documents the general skillHooks framework (#1481)', () => {
  const md = fs.readFileSync(AUTOPILOT_SKILL_MD, 'utf-8');

  it('names the general skillHooks config surface, not the removed review.additionalSkills', () => {
    expect(md).toMatch(/skillHooks/);
    expect(md).not.toMatch(/review\.additionalSkills/);
  });

  it('documents the three hook kinds (skill / prompt / command)', () => {
    const section = extractSection(md, 'Lifecycle skill hooks');
    expect(section).toMatch(/`skill`/);
    expect(section).toMatch(/`prompt`/);
    expect(section).toMatch(/`command`/);
  });

  it('documents the enabled toggle and the hook input-context contract', () => {
    const section = extractSection(md, 'Lifecycle skill hooks');
    expect(section).toMatch(/enabled/);
    expect(section).toMatch(/HARNESS_HOOK_EVENT/);
    expect(section).toMatch(/HARNESS_CHANGED_FILES/);
    expect(section).toMatch(/stdin/i);
  });

  it('documents the command hard-halt vs finding distinction', () => {
    const section = extractSection(md, 'Lifecycle skill hooks');
    expect(section).toMatch(/cannot be spawned/i);
    expect(section).toMatch(/exited non-zero/i);
    expect(section).toMatch(/hard halt/i);
  });

  it('documents the generic dispatch pattern and the extension contract', () => {
    const section = extractSection(md, 'Lifecycle skill hooks');
    expect(section).toMatch(/resolveSkillHooks/);
    expect(section).toMatch(/hook-supporting/i);
  });

  it('documents the reserved v2 extension points', () => {
    const section = extractSection(md, 'Lifecycle skill hooks');
    expect(section).toMatch(/RESERVED/);
    expect(section).toMatch(/wildcard|\*/);
    expect(section).toMatch(/per-item|per-iteration|dispatch:item|EXECUTE:task/i);
  });

  it('REVIEW runs after:REVIEW hooks, keeps the baseline reviewer, and hard-halts on an unresolvable hook', () => {
    const review = extractSection(md, 'REVIEW');
    expect(review).toMatch(/after:REVIEW/);
    expect(review).toMatch(/harness-code-reviewer/);
    expect(review).toMatch(/cannot verify|hard halt|failure, not a (silent )?skip/i);
  });

  it('FINAL_REVIEW runs after:FINAL_REVIEW hooks and hard-halts on an unresolvable hook', () => {
    const finalReview = extractSection(md, 'FINAL_REVIEW');
    expect(finalReview).toMatch(/after:FINAL_REVIEW/);
    expect(finalReview).toMatch(/harness-code-reviewer/);
    expect(finalReview).toMatch(/cannot verify|hard halt|failure, not a (silent )?skip/i);
  });

  it('EXECUTE wires before:EXECUTE hooks (non-review generality proof)', () => {
    const execute = extractSection(md, 'EXECUTE');
    expect(execute).toMatch(/before:EXECUTE/);
    expect(execute).toMatch(/resolveSkillHooks/);
  });

  it('auto-wires canary deterministic detectors at REVIEW/FINAL_REVIEW when canary is present (#1482)', () => {
    const vocab = extractSection(md, 'Lifecycle skill hooks');
    // Uses the merged resolver at the review events and names all four detectors.
    expect(vocab).toMatch(/resolveReviewHooksWithCanary/);
    expect(vocab).toMatch(/canary_probe/);
    for (const detector of [
      'canary-savant',
      'canary-blackhawk',
      'canary-katana',
      'canary-cassandra',
    ]) {
      expect(vocab).toContain(detector);
    }
    // Additive (alongside, not replacing) and canary-absent = no regression.
    expect(vocab).toMatch(/alongside `harness-code-reviewer`/);
    expect(vocab).toMatch(/no regression/);
    // Forward-wired: a not-installed harness-default detector is a GRACEFUL SKIP,
    // never a hard halt when a detector is not installed.
    expect(vocab).toMatch(/forward-wired/i);
    // The doc must NOT pin a canary version as the current state. It previously
    // asserted canary 5.12.0 ships none of the four; that went stale and made a
    // silent 0/4 read as expected behaviour. Pin the durable contract instead:
    // prefix-insensitive availability matching, and denominator reporting.
    expect(vocab).not.toMatch(/5\.12\.0/);
    expect(vocab).toMatch(/prefix-insensitiv/i);
    expect(vocab).toMatch(/denominator/i);
    expect(vocab).toMatch(/graceful skip|never a hard halt|SKIPPED, never a hard halt/i);
    // The resolver takes an availability set so only installed detectors wire.
    expect(vocab).toMatch(/availableSkills/);
    // The hard-halt is reserved for USER-declared unresolvable hooks.
    expect(vocab).toMatch(/USER-declared unresolvable hook still HARD-HALTS/i);
  });

  it('reserves the hard-halt for user-declared hooks, not harness-default canary detectors', () => {
    // REVIEW: a user-declared unresolvable hook hard-halts; a not-installed
    // canary default is filtered out (graceful skip), not a hard halt.
    const review = extractSection(md, 'REVIEW');
    expect(review).toMatch(/user-declared/i);
    expect(review).toMatch(/harness-default canary detector.*not installed/i);
    expect(review).toMatch(/never a hard halt/i);
    // FINAL_REVIEW carries the same distinction.
    const finalReview = extractSection(md, 'FINAL_REVIEW');
    expect(finalReview).toMatch(/user-declared/i);
    expect(finalReview).toMatch(/forward-wired|graceful skip|never a FINAL_REVIEW failure/i);
  });

  it('wires on:failure at the failure path with HARNESS_FAILURE_REASON', () => {
    expect(md).toMatch(/on:failure/);
    expect(md).toMatch(/HARNESS_FAILURE_REASON/);
  });

  it('documents the unresolvable-hook failure as a hard halt recorded in failures.md', () => {
    expect(md).toMatch(/hard halt|not an? overridable/i);
    expect(md).toMatch(/failures\.md/);
  });

  // Guards against the vocabulary overpromising which events actually fire: a
  // hook configured at an unwired event is a silent no-op, so the documented
  // "wired today" set must equal the concrete resolveSkillHooks(...) call sites.
  it('wires exactly the four events it advertises as wired (no silent-no-op overpromise)', () => {
    const WIRED = ['before:EXECUTE', 'after:REVIEW', 'after:FINAL_REVIEW', 'on:failure'];
    // Concrete call sites in the prose, ignoring the generic <...:<STATE>> placeholder.
    // The review events resolve through TWO layered resolvers:
    // resolveReviewHooksWithCanary (canary's deterministic detectors, #1482) and
    // resolveReviewHooksWithCraft (craft's advisory domains); the non-review
    // events resolve through the bare resolveSkillHooks. All three are concrete
    // wiring call sites.
    //
    // WIDENING THIS IS NOT EVIDENCE OF ANYTHING, and the comment says so on
    // purpose. Craft's two events are ALREADY in WIRED via canary, so this
    // assertion is satisfied with or without the craft lines — measured, both
    // before and after the alternation was widened. The law that can actually
    // fail on craft is "documents the craft resolver at exactly its two review
    // events" below, which uses craft's OWN denominator.
    const callSites = new Set(
      [
        ...md.matchAll(
          /(?:resolveSkillHooks|resolveReviewHooksWithCanary|resolveReviewHooksWithCraft)\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g
        ),
      ]
        .map((m) => m[1])
        .filter((e) => /^(before|after|on):[A-Za-z0-9_-]+$/.test(e))
    );
    expect([...callSites].sort()).toEqual([...WIRED].sort());
    // The vocabulary must flag the rest as not-yet-wired rather than claim they fire.
    const vocab = extractSection(md, 'Lifecycle skill hooks');
    expect(vocab).toMatch(/not yet wired|no-op/i);
    for (const e of WIRED) expect(vocab).toContain(e);
  });

  // MEASURED DURING PLANNING AND RE-MEASURED AT EXECUTION: adding a craft call
  // site to SKILL.md left the generic "wires exactly the four events"
  // assertion above GREEN (16/16), because the craft resolver matched neither
  // alternative; and widening the alternation does not fix it either, because
  // craft's two events are already in WIRED via canary. Both craft's presence
  // AND its absence are invisible there. Craft therefore needs its OWN
  // denominator, which is what these three tests are.
  it('documents the craft resolver at exactly its two review events', () => {
    const CRAFT_WIRED = ['after:REVIEW', 'after:FINAL_REVIEW'];
    const craftSites = new Set(
      [
        ...md.matchAll(
          /resolveReviewHooksWithCraft\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g
        ),
      ]
        .map((m) => m[1])
        // Same placeholder filter the generic law uses: the vocabulary's
        // `"<after:REVIEW|after:FINAL_REVIEW>"` is a FORM, not a call site.
        // Without this the law fails against correct prose, which is a law
        // that blocks documentation rather than a law that catches drift.
        .filter((e) => /^(before|after|on):[A-Za-z0-9_-]+$/.test(e))
    );
    expect([...craftSites].sort()).toEqual([...CRAFT_WIRED].sort());
  });

  it('states the craft contract the resolver cannot enforce from prose alone', () => {
    const vocab = extractSection(md, 'Lifecycle skill hooks');
    // Advisory, not blocking (spec D2 / criterion 3).
    expect(vocab).toMatch(/ADVISORY, NOT BLOCKING/i);
    expect(vocab).toMatch(/do \*\*not\*\* contribute to the `error`\/`warn` severity counts/i);
    // Diff scope, and the ABSOLUTE-path requirement without which a run reads nothing.
    expect(vocab).toMatch(/plan\.files\[skill\]/);
    expect(vocab).toMatch(/ABSOLUTE paths|resolve each entry against the project root/i);
    expect(vocab).toMatch(/promptBudget/);
    // Once per phase per diff (D10 / criterion 8).
    expect(vocab).toMatch(/alreadyRanFor/);
    // Denominator (criterion 6) and graceful skip vs user hard-halt (criteria 7).
    expect(vocab).toMatch(/craft domains: \d+\/\d+ activated/);
    expect(vocab).toMatch(/SKIPPED, never a hard halt/i);
    expect(vocab).toMatch(/USER-declared unresolvable hook still\s+HARD-HALTS/i);
    expect(vocab).toMatch(/no-diff-context/);
  });

  it('names craft in both review steps, not only in the vocabulary', () => {
    expect(extractSection(md, 'REVIEW')).toMatch(/resolveReviewHooksWithCraft/);
    expect(extractSection(md, 'FINAL_REVIEW')).toMatch(/alreadyRanFor/);
  });
});

describe('harness-code-review is a second skillHooks consumer (not autopilot-locked)', () => {
  const md = fs.readFileSync(CODE_REVIEW_SKILL_MD, 'utf-8');

  it('declares the after:mechanical hookable event and resolves hooks', () => {
    expect(md).toMatch(/after:mechanical/);
    expect(md).toMatch(/resolveSkillHooks\(config, "harness-code-review", "after:mechanical"\)/);
  });

  it('honors the framework hard-halt protection', () => {
    expect(md).toMatch(/hard halt/i);
  });

  // MEASURED ON THIS TREE (cdb12047b) BEFORE THESE LAWS EXISTED, with the
  // mutation diff printed in the same command as the test result: inserting
  // a craft call site wired at a BOGUS event (`after:WRONG_EVENT`) plus a
  // sentence contradicting the hard-halt rule left this file 19/19 GREEN,
  // and so did removing craft entirely. The two `it`s above cannot fail for
  // craft in EITHER direction: `resolveSkillHooks\(config, "harness-code-review"`
  // does not match `resolveReviewHooksWithCraft(`, and `/hard halt/i` is
  // already satisfied by the user-declared-hook paragraph at :204. THEIR
  // GREEN IS NOT EVIDENCE THAT CRAFT IS WIRED HERE. The five laws below are
  // craft's own denominator for this host — the Phase 3 CRAFT_WIRED pattern.
  const PHASE2 = (): string => extractSection(md, 'Phase 2: MECHANICAL');

  it('documents the craft resolver at exactly the event this host wires', () => {
    // DERIVED from the per-host vocabulary, never retyped: changing
    // CRAFT_REVIEW_EVENTS_BY_HOST without updating the prose reddens here.
    const expected = [...CRAFT_REVIEW_EVENTS_BY_HOST['harness-code-review']];
    expect(expected).toEqual(['after:mechanical']); // denominator pinned before use
    const craftSites = new Set(
      [
        ...md.matchAll(
          /resolveReviewHooksWithCraft\(config,\s*"harness-code-review",\s*"([^"]+)"[,)]/g
        ),
      ]
        .map((m) => m[1])
        // Same placeholder filter the autopilot laws use: a documented FORM
        // like "<after:X|after:Y>" is not a call site.
        .filter((e) => /^(before|after|on):[A-Za-z0-9_-]+$/.test(e))
    );
    expect([...craftSites].sort()).toEqual([...expected].sort());
  });

  it('records the timing asymmetry at the call site (pre-review here, post-review under autopilot)', () => {
    const s = PHASE2();
    expect(s).toMatch(/TIMING ASYMMETRY/);
    // CORRECTION TO THIS LAW AS PLANNED, and it was MEASURED, not reasoned:
    // scoped to the whole Phase 2 section, `AI fan-out` was VACUOUS. The
    // pre-existing :204 hook paragraph already reads "...established, before
    // the AI fan-out", so a sub-probe (M-CR-ASYM-CLAUSE) that renamed ONLY
    // this bullet's clause to "AI dispatch" left the law 24/24 GREEN. That is
    // the same blindness mechanism this file exists to expose, reproduced
    // inside the fix for it. Evaluating all 15 asserted phrases against the
    // PRE-craft section found exactly this one vacuous and the other 14
    // able to fail. Scoping the clauses to the bullet makes it fail.
    const bullet = s.slice(s.indexOf('- **TIMING ASYMMETRY')).split(/\n- \*\*/)[0];
    expect(bullet).toMatch(/before\*{0,2}\s+the\s+(?:Phase 4\s+)?AI fan-out/i);
    expect(bullet).toMatch(/after:REVIEW/);
    expect(bullet).toMatch(/CRAFT_REVIEW_EVENTS_BY_HOST/);
  });

  it('exempts forward-wired craft defaults from this skill\u2019s hard-halt rule', () => {
    const s = PHASE2();
    expect(s).toMatch(/SKIPPED, never a hard halt/i);
    expect(s).toMatch(/EXCEPTION/);
    expect(s).toMatch(/forward-wired|harness-OPTIMISTIC/i);
    expect(s).toMatch(/user-declared-but-unresolvable\s*=\s*hard\s+halt/i);
  });

  it('keeps craft findings out of the mechanical exclusion set and the severity counts', () => {
    const s = PHASE2();
    expect(s).toMatch(/MUST NOT enter the mechanical exclusion set/i);
    expect(s).toMatch(/severity counts/i);
  });

  it('states the diff-scoped forwarding contract and the denominator', () => {
    const s = PHASE2();
    expect(s).toMatch(/plan\.files\[skill\]/);
    expect(s).toMatch(/ABSOLUTE/);
    expect(s).toMatch(/promptBudget/);
    expect(s).toMatch(/no-diff-context/);
    expect(s).toMatch(/craft domains: \d+\/\d+ activated/);
  });

  // MUTATION RESULTS (2026-11-13, this tree, diff printed in the same command
  // as the result): M-CR-EVENT ("after:mechanical" -> "after:WRONG") and
  // M-CR-EVENT-DROP (delete the call-site line) each reddened the craft-event
  // law with `[ 'after:WRONG' ]` / `[]` against `[ 'after:mechanical' ]`,
  // while BOTH pre-existing `it`s above stayed GREEN (verbose reporter, named
  // explicitly) — the blindness claim measured, not asserted. M-CR-ASYM /
  // M-CR-HALT / M-CR-EXCLUDE / M-CR-FORWARD each deleted a WHOLE bullet
  // (7 / 8 / 6 / 8 lines, anchor verified to match exactly once) and each
  // reddened exactly its own law, 1 failed | 23 passed, every other craft law
  // GREEN. Under M-CR-HALT, `honors the framework hard-halt protection`
  // remained GREEN — the pre-existing law cannot see the EXCEPTION claim at
  // all. 0 survivors. The one vacuous assertion found by the pre-craft
  // positive control is corrected in place above.
});
