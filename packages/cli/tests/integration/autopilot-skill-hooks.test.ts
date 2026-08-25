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
    // The review events (after:REVIEW / after:FINAL_REVIEW) resolve through
    // resolveReviewHooksWithCanary (which layers canary's deterministic detectors
    // on top of the configured skillHooks, #1482); the non-review events resolve
    // through the bare resolveSkillHooks. Both are concrete wiring call sites.
    const callSites = new Set(
      [
        ...md.matchAll(
          /(?:resolveSkillHooks|resolveReviewHooksWithCanary)\(config,\s*"harness-autopilot",\s*"([^"]+)"[,)]/g
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
});
