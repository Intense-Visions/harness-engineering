// agents/skills/tests/autopilot-review-fidelity.test.ts
//
// Shift-left pipeline fidelity, Phase 1: autopilot's reviews fan out and are gated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  PROVENANCE_MARKER,
  REVIEW_GATE_FAILURE_CODES,
  noteText,
  parseProvenanceStamp,
} from '@harness-engineering/core';

const SKILL = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'claude-code',
  'harness-autopilot',
  'SKILL.md'
);
export const md = () => readFileSync(SKILL, 'utf-8');

/** The text from a heading to the next heading of the same or higher level. */
export function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = (/^#+/.exec(heading) ?? [''])[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

describe('Persona Agents table', () => {
  it('maps harness-code-review to every reviewer persona REVIEW and FINAL_REVIEW dispatch', () => {
    const row = section(md(), '## Persona Agents')
      .split('\n')
      .find((l) => l.startsWith('| harness-code-review'));
    expect(row).toBeDefined();
    for (const persona of [
      'harness-code-reviewer',
      'harness-security-reviewer',
      'harness-adversarial-reviewer',
      'harness-typescript-strict-reviewer',
      'harness-frontend-races-reviewer',
    ]) {
      expect(row, persona).toContain(`\`${persona}\``);
    }
    expect(row).toMatch(/REVIEW, FINAL_REVIEW/);
    // The same five personas the REVIEW section dispatches.
    const review = section(md(), '### REVIEW');
    for (const persona of row?.match(/`harness-[a-z-]+`/g) ?? []) {
      expect(review, persona).toContain(persona);
    }
  });
});

describe('REVIEW: tier, fan-out, receipt, gate (SC1, SC2)', () => {
  const review = () => section(md(), '### REVIEW');
  it('no longer hands the whole review skill to one subagent', () => {
    expect(review()).not.toMatch(/Follow harness-code-review\. Report findings/);
    expect(review()).toMatch(/do not hand the whole skill to one subagent/);
  });
  it('computes the tier from the four rules and states it', () => {
    const text = review();
    expect(text).toContain('selectReviewTier');
    for (const rule of [
      'risk keyword',
      'package entry point',
      'complexity is `high`',
      '`thorough`',
    ]) {
      expect(text, rule).toContain(rule);
    }
    expect(text).toMatch(/computed, not asked/);
  });
  it('N4: runs harness review-tier and uses its output; the prose rules are the fallback', () => {
    const text = review();
    expect(text).toContain(
      'Run `harness review-tier --base {base} --head {head} --complexity {complexity} --rigor {rigorLevel}`'
    );
    expect(text).toMatch(/and use its output: the tier, its reasons and the backend/);
    expect(text).toMatch(/add `--pipeline-runner` when the `run_code_review` tool is callable/);
    expect(text).toMatch(/The rules below describe what the command computes/);
    expect(text).toMatch(/apply them by hand only when the CLI is unavailable/);
    expect(text).toMatch(
      /If the command exits non-zero on a range that does change files, it could not compute a tier \(an unresolvable `\{base\}` or `\{head\}`, a range git cannot list\): do not assume `light`/
    );
    // Round 4: a diff too large to read is full, never light and never an error.
    expect(text).toMatch(
      /A diff larger than git's output buffer gives `full` with the reason `diff-too-large`, never `light` and never an error/
    );
    expect(text).toMatch(/Use the `Review backend:` line of the same command/);
    expect(text).toMatch(/marked `DEGRADED` when the pipeline was configured/);
    expect(text).not.toMatch(/Apply `selectReviewTier`/);
  });
  it('SC1: a full review dispatches one reviewer per record, each writing its own findings file', () => {
    const text = review();
    expect(text).toMatch(/one dispatch per reviewer/);
    expect(text).toContain('{sessionDir}/reviews/phase-{N}/{reviewerId}.json');
    expect(text).toContain('You are the {reviewerId} reviewer ONLY');
    for (const id of ['compliance', 'bug', 'security', 'architecture']) {
      expect(text, id).toContain(`\`${id}\``);
    }
    expect(text).toContain('in parallel: `compliance`, `bug`, `security`, `architecture`, plus');
    const prompts = text.split('\n').filter((l) => l.trim().startsWith('prompt:'));
    const reviewerBriefs = prompts.filter((p) => p.includes('reviews/phase-{N}/'));
    expect(reviewerBriefs).toHaveLength(2);
    for (const p of reviewerBriefs) expect(p).toContain('references/attribution-rubric.md');
  });
  it('a light review is one dispatch in dispatched mode writing compliance-bug.json', () => {
    expect(review()).toContain('{sessionDir}/reviews/phase-{N}/compliance-bug.json');
    expect(review()).toContain(
      'Follow harness-code-review in dispatched mode: review-dir {sessionDir}/reviews/phase-{N}/, moment phase, tier light, base {base}, head {head}.'
    );
  });
  it('writes the receipt and may not leave REVIEW without a passing gate', () => {
    const text = review();
    expect(text).toContain('{sessionDir}/reviews/phase-{N}/receipt.json');
    expect(text).toContain('harness check-review-receipt {sessionDir}/reviews/phase-{N}');
    expect(text).toContain('check_review_receipt');
    expect(text).toMatch(/REVIEW may not be left/);
    expect(text).toContain('ask "re-run / override / stop."');
  });
  it('N6: the receipt counts come from the findings files, which the gate recounts', () => {
    const text = review();
    expect(text).toMatch(
      /the `blocking` and `advisory` counts over the reviewer findings files as written \(every finding once: `critical` and `important` are blocking, `suggestion` is advisory, nothing is merged by location; the gate recounts them and fails on a mismatch\)/
    );
    expect(md()).not.toMatch(/one per file and start line/);
    expect(text).not.toMatch(/counts after Phase 6/);
  });
  it('keeps the pinned blocking-findings pause and stops writing the legacy file', () => {
    const text = review();
    expect(text).toContain('Blocking → ask "fix / override / stop."');
    expect(text).not.toContain('Persist findings to `{sessionDir}/phase-{N}-review.json`');
    expect(text).toMatch(/never written/);
  });
  it('the orchestrating session dispatches and collects; it does not review (Iron Law)', () => {
    const text = review();
    expect(text).toMatch(/It writes no finding of its own/);
    expect(text).toMatch(/never writes a dispatched reviewer's findings file/);
    expect(text).toMatch(
      /a reviewer that returned no file, and did not report a failed mechanical phase, is `ran: false`/
    );
    expect(text).toMatch(/A reviewer whose dispatch failed is `required: true`, `ran: false`/);
  });
  it('D7: a session that cannot dispatch records light, never full', () => {
    const text = review();
    expect(text).toMatch(/\*\*This session has no subagent-spawning tool:\*\* it cannot fan out/);
    expect(text).toMatch(/record `tier: "light"` whatever step 1 computed/);
    expect(text).toMatch(/Never record `full` for a review whose reviewers did not each run/);
  });
  it('phase reviewer briefs carry no earlier findings and the receipt says so', () => {
    const text = review();
    expect(text).toMatch(/`coldContext: true` and `priorFindingsSupplied: false`/);
    const prompts = text.split('\n').filter((l) => l.trim().startsWith('prompt:'));
    expect(prompts.length).toBeGreaterThanOrEqual(3);
    for (const p of prompts) expect(p).not.toMatch(/[Pp]rior findings|earlier review/);
  });
  it('states what the gate fails on and reads the tool result by pass alone', () => {
    const text = review();
    expect(text).toMatch(/decide on its `pass` field alone/);
    expect(text).toMatch(
      /`failures` is absent on a pass, one object for one failure and a list for several/
    );
    expect(text).toMatch(/A missing receipt fails the gate/);
    expect(text).toMatch(/a required reviewer that did not run/);
    expect(text).toMatch(/a HEAD that moved after the review/);
    expect(text).toMatch(/`blocking` or `advisory` counts that differ from the findings files/);
  });
  it('the gate pause sits under a gate marker and is ordered: receipt, hooks, gate, findings', () => {
    const lines = review().split('\n');
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    const gateFail = at('If the receipt gate fails, REVIEW may not be left.');
    expect(lines[gateFail - 1]).toBe(
      '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->'
    );
    const order = [
      at('**4. Write the receipt**'),
      at('**5. Run each effective `after:REVIEW` hook.**'),
      at('**6. Gate the receipt.**'),
      gateFail,
      at('**7. Settle dismissals.**'),
      at('**8. Decide on the blocking findings**'),
      at('Blocking → ask "fix / override / stop."'),
    ];
    expect(order.every((n) => n > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('leaves the canary and craft hook wiring at after:REVIEW in place', () => {
    const text = review();
    expect(text).toContain(
      'resolveReviewHooksWithCanary(config, "harness-autopilot", "after:REVIEW", { canaryPresent, availableSkills })'
    );
    expect(text).toContain(
      '`resolveReviewHooksWithCraft(config, "harness-autopilot", "after:REVIEW", { changedFiles, availableSkills })`'
    );
    expect(text).toContain('{sessionDir}/reviews/phase-{N}/hook-<hook name>.json');
  });
  it('SC15: resolves the backend and records agent when the pipeline is not callable', () => {
    expect(review()).toContain('`review.backend`');
    expect(review()).toMatch(/record `backend: "agent"`/);
  });
});

describe('FINAL_REVIEW: cold and full (SC4, D6)', () => {
  const final = () => section(md(), '### FINAL_REVIEW');
  it('hands no prior findings and no coherence-only focus to any reviewer', () => {
    const text = final();
    expect(text).not.toMatch(/Prior findings: \{collected\}/);
    expect(text).not.toMatch(/Focus on cross-phase coherence/);
    expect(text).toMatch(/nothing from earlier reviews/);
  });
  it('round 4: takes the base from harness review-tier, never from a hand-run recipe', () => {
    const text = final();
    expect(text).toContain(
      'Resolve the cold diff with the command the gate shares its resolver with: `harness review-tier --moment final --session {sessionSlug}`'
    );
    expect(text).toMatch(/Take `\{base\}` and `\{head\}` from its output and from nothing else/);
    expect(text).toContain('`diff.baseSource: "starting-commit"`');
    expect(text).toMatch(/Never pick a base by hand/);
    expect(md()).not.toMatch(/git merge-base|symbolic-ref|origin\/master/);
  });
  it('is always full: --fast does not lower it', () => {
    expect(final()).toMatch(/always `full`: `--fast` does not lower it/);
    expect(final()).toMatch(/the command of step 2 prints `full` whatever the rigor/);
  });
  it('SC4: the receipt records the final moment as full, cold, with no prior findings', () => {
    const text = final();
    expect(text).toContain('the review directory is `{sessionDir}/reviews/final-all/`');
    expect(text).toMatch(
      /`moment: "final"`, `tier: "full"`, `coldContext: true`, `priorFindingsSupplied: false`/
    );
  });
  it('labels repeats only after every reviewer has returned, and never drops them', () => {
    const text = final();
    const brief = text.indexOf('You are the {reviewerId} reviewer ONLY');
    const label = text.indexOf('previously-raised');
    expect(brief).toBeGreaterThan(0);
    expect(label).toBeGreaterThan(brief);
    expect(text).toMatch(/After every reviewer has returned/);
    expect(text).toMatch(/never removes a finding or lowers its severity/);
  });
  it('no dispatch brief in FINAL_REVIEW mentions earlier reviews, phases or coherence', () => {
    const prompts = final()
      .split('\n')
      .filter((l) => l.trim().startsWith('prompt:'));
    expect(prompts).toHaveLength(2);
    for (const p of prompts) {
      expect(p).not.toMatch(/prior|previous|earlier|coheren|per-phase|cross-phase|\{collected\}/i);
      expect(p).toContain('git diff {base}..{head}');
      expect(p).not.toContain('startingCommit');
    }
    expect(prompts[0]).toContain('harness-code-review references/attribution-rubric.md');
    expect(final()).toMatch(/no prior findings, no per-phase summary, no coherence-only focus/);
    expect(final()).toMatch(/Each reviewer does the full hunt of its domain over the whole diff/);
  });
  it('the cold and full fields are claims: a brief that carried findings is recorded and fails', () => {
    const text = final();
    expect(text).toMatch(
      /if any brief did carry earlier findings, record `priorFindingsSupplied: true` and `coldContext: false`, and the gate fails/
    );
    expect(text).toMatch(
      /the gate also fails unless `tier` is `full`, `coldContext` is true and `priorFindingsSupplied` is false/
    );
    expect(text).toMatch(/it fails when HEAD moved after the review/);
    expect(text).toMatch(/decide on its `pass` field alone/);
    expect(text).toMatch(/the final gate fails \(`FINAL_NOT_FULL`\)/);
    expect(text).toMatch(/It never records `full`;/);
  });
  it('the final gate pause is a gate, and the hook wiring at after:FINAL_REVIEW is in place', () => {
    const lines = final().split('\n');
    const gateFail = lines.findIndex((l) =>
      l.includes('If the receipt gate fails, FINAL_REVIEW may not be left.')
    );
    expect(gateFail).toBeGreaterThan(0);
    expect(lines.slice(gateFail - 3, gateFail).map((l) => l.trim())).toContain(
      '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->'
    );
    const text = final();
    expect(text).toContain(
      'resolveReviewHooksWithCanary(config, "harness-autopilot", "after:FINAL_REVIEW", { canaryPresent, availableSkills })'
    );
    expect(text).toContain(
      '`resolveReviewHooksWithCraft(config, "harness-autopilot", "after:FINAL_REVIEW", { changedFiles, availableSkills, alreadyRanFor })`'
    );
  });
  it('names its reviewer personas itself, so the section stands alone', () => {
    const text = final();
    for (const persona of [
      'harness-code-reviewer',
      'harness-security-reviewer',
      'harness-adversarial-reviewer',
      'harness-typescript-strict-reviewer',
      'harness-frontend-races-reviewer',
    ]) {
      expect(text, persona).toContain(`\`${persona}\``);
    }
    expect(text).toMatch(
      /`harness-code-reviewer` for `compliance`, `bug` and `architecture`; `harness-security-reviewer` for `security`/
    );
  });
  it('gates the final receipt and may not leave FINAL_REVIEW without a passing one', () => {
    const text = final();
    expect(text).toContain('harness check-review-receipt {sessionDir}/reviews/final-all');
    expect(text).toMatch(/FINAL_REVIEW may not be left/);
    expect(text).toContain('5. Blocking: ask "fix / override / stop."');
  });
});

describe('DONE: the PR (SC6)', () => {
  const done = () => section(md(), '### DONE');
  it('keeps the pinned PR question and the closing-keyword rule', () => {
    expect(done()).toContain('Ask "Create a PR? (yes / no)."');
    expect(done()).toContain('include a bare closing line `Closes #<N>`');
  });
});

describe('summaries and examples match the new review states', () => {
  it('the Process list describes the fan-out and the cold final review', () => {
    const process = section(md(), '## Process');
    expect(process).not.toMatch(/\*\*REVIEW\*\* — Dispatch harness-code-reviewer plus/);
    expect(process).toMatch(/\*\*REVIEW\*\* — Select the review tier/);
    expect(process).toMatch(/Cold, full final review/);
    const item7 = process.split('\n').find((l) => l.startsWith('7. **REVIEW**')) ?? '';
    expect(item7).toMatch(/one reviewer per record \(`full`\) or one reviewer \(`light`\)/);
    expect(item7.indexOf('write the receipt')).toBeGreaterThan(0);
    expect(item7.indexOf('gate the receipt')).toBeGreaterThan(item7.indexOf('write the receipt'));
    expect(item7).toContain('resolveReviewHooksWithCanary');
    expect(item7).toContain('resolveReviewHooksWithCraft');
    expect(section(md(), '## Success Criteria')).toContain(
      'FINAL_REVIEW is a cold, `full` review of the diff from the merge base'
    );
  });
  it('the Iron Law and its gate name review dispatch as orchestration, not reimplementation', () => {
    const text = md();
    const NOT_A_PAUSE = '<!-- not-a-pause: self-correction against reimplementing skills -->';
    const law = text.split('\n').find((l) => l.startsWith('**Iron Law:**')) ?? '';
    expect(law).toMatch(
      /dispatching one reviewer per record and collecting their findings files is orchestration/
    );
    expect(law).toMatch(/this session writes no finding of its own/);
    expect(law.endsWith(NOT_A_PAUSE)).toBe(true);
    // The old sentence ended the paragraph right after the persona rule.
    expect(law).not.toContain(`never general-purpose agents. ${NOT_A_PAUSE}`);
    const gate =
      section(text, '## Gates')
        .split('\n')
        .find((l) => l.startsWith('- **No reimplementing delegated skills.**')) ?? '';
    expect(gate).toMatch(
      /dispatching reviewers and collecting their findings files at REVIEW and FINAL_REVIEW is orchestration/
    );
    expect(gate).toMatch(/writing a review finding in this session is not/);
    expect(gate.endsWith(NOT_A_PAUSE)).toBe(true);
    expect(gate).not.toContain(`Delegate via \`subagent_type\`. ${NOT_A_PAUSE}`);
  });
  it('nothing in the skill still calls the final review a coherence pass', () => {
    expect(md()).not.toMatch(/catches cross-phase coherence issues/);
  });
});

describe('review round 2: Review records (A1, A3, A6, A7, A9)', () => {
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  it('sits before REVIEW and is shared by both review states', () => {
    const text = md();
    expect(text.indexOf('### Review records')).toBeLessThan(text.indexOf('### REVIEW\n'));
    expect(records()).toMatch(/REVIEW and FINAL_REVIEW share the rules in this section/);
  });
  it('A1: every reviewer brief and the findings-file shape carry head', () => {
    const prompts = md()
      .split('\n')
      .filter((l) => l.trim().startsWith('prompt:') && l.includes('/reviews/'));
    expect(prompts).toHaveLength(3);
    for (const p of prompts) {
      expect(p).toMatch(/base: \\"\{base\}\\", head: \\"\{head\}\\", examinedFiles, findings \}/);
      expect(p).toMatch(/moment (?:phase|final), (?:tier light, )?base \{base\}, head \{head\}\./);
      expect(p).toMatch(/[Rr]eview-dir \{sessionDir\}\/reviews\/(?:phase-\{N\}|final-all)\//);
      expect(p).toMatch(/every finding id starts with (?:compliance-bug|\{reviewerId\})-/);
    }
    expect(md()).not.toMatch(
      /\{ schemaVersion: 1, reviewerId(?:: \\"compliance-bug\\")?, examinedFiles/
    );
    const text = records();
    expect(text).toContain(
      '`{ schemaVersion: 1, reviewerId, base, head, examinedFiles, findings }`'
    );
    expect(text).toMatch(/a file written for another range fails `FINDINGS_BASE_MISMATCH`/);
    expect(text).toMatch(
      /a file without it is invalid \(`FINDINGS_FILE_INVALID`\) and a file written at another head fails `FINDINGS_HEAD_MISMATCH`/
    );
    expect(text).toMatch(
      /Give every brief `\{base\}` and `\{head\}` as resolved shas, never as the word `HEAD`/
    );
  });
  it('A7: one rule for who writes the receipt, and who runs MECHANICAL for a light review', () => {
    const text = records();
    expect(text).toMatch(
      /For a `light` review the dispatched reviewer runs harness-code-review Phase 2 \(MECHANICAL\) and Phase 3 \(CONTEXT\) itself/
    );
    const light = review()
      .split('\n')
      .find((l) => l.includes('compliance-bug.json, as'));
    expect(light).toMatch(/Run its Phase 2 \(MECHANICAL\) and Phase 3 \(CONTEXT\) yourself/);
  });
  it('round 4: no sentence numbers a review directory with no receipt as round 1', () => {
    const text = records();
    expect(md()).not.toMatch(/round 1 when the directory holds no receipt/);
  });
  it('A6: VALIDATE and DEDUP never change the receipt counts', () => {
    const text = records();
    expect(text).toMatch(/They never edit a findings file, never change these counts/);
  });
  it('A9: hook findings have their own files, are never in the receipt counts, and still block', () => {
    const text = records();
    expect(text).toMatch(/A hook finding still blocks per that hook's own policy/);
    expect(review()).not.toMatch(/merge them into the same blocking\/non-blocking aggregation/);
    expect(review()).toMatch(
      /A hook file \(`hook-<hook name>\.json`, below\) is never a reviewer record and its findings are never in these counts/
    );
  });
});

describe('review round 2: moment, tier, base and commits after the final review (A2, A4, A5, A8)', () => {
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  const done = () => section(md(), '### DONE');
  it('A2: the gate reads the moment from the directory; the light roster is compliance-bug', () => {
    const text = review();
    expect(text).toMatch(
      /The review directory decides the moment, and nothing a caller passes changes it: `phase-\{N\}` is a phase review and `final-all` is the final review/
    );
    expect(text).toMatch(/A receipt whose `moment` says otherwise fails `MOMENT_MISMATCH`/);
    expect(text).toMatch(
      /The flag exists for a receipt in a directory that states no moment, such as a copy made elsewhere, which fails `MOMENT_UNKNOWN` without it/
    );
    expect(text).toMatch(
      /A `light` receipt lists exactly one required reviewer and its id is `compliance-bug`; any other roster fails `LIGHT_TIER_ROSTER`/
    );
    expect(final()).toMatch(
      /The directory `final-all` decides the moment: it is the final review, so a receipt there that says `phase` fails `MOMENT_MISMATCH`/
    );
  });
  it('A8: the tier reads every commit message of the range, trailers excluded, from the top level', () => {
    const text = review();
    expect(text).toMatch(
      /The command runs git from the repository top level and reads `review\.backend` from the `harness\.config\.json` at that top level \(a `harness\.config\.json` in a subdirectory, such as an example project's, is not read\), so it prints the same tier and backend from any directory of the repository/
    );
    expect(text).toMatch(/every commit message of `\{base\}\.\.\{head\}`/);
    expect(text).toMatch(
      /the diff, a changed path or any commit message of the range matches at least one risk keyword/
    );
    expect(text).toMatch(
      /The command decides which commit-message trailers are left out of the match: identity trailers only/
    );
    expect(md()).not.toMatch(/latest commit message/);
  });
  it('A5: the final base is resolved the way the gate resolves it', () => {
    const text = final();
    expect(text).toMatch(
      /The gate demands exactly this base: the default-branch merge base whenever one resolves \(any other base fails `FINAL_BASE_NOT_MERGE_BASE`, whatever `baseSource` says\), and the session's starting commit only when none resolves/
    );
    expect(text).toMatch(/`DIFF_BASE_NOT_ANCESTOR`/);
    expect(text).toMatch(
      /it fails unless `diff\.base` is the base of step 2 \(`FINAL_BASE_NOT_MERGE_BASE`, `STARTING_COMMIT_UNKNOWN`; `TARGET_UNRESOLVED` when the recorded `diff\.target` is not a remote-tracking branch that resolves, `TARGET_OWN_BRANCH` when it is this branch itself\)/
    );
    expect(text).toMatch(
      /When the command prints `Review base: unresolved \(<why>\)` \(`baseUnresolved` in JSON\) no base the gate would accept is known/
    );
    // Round 4, residual: the merge base is computed from refs the session could rewrite.
    expect(text).toMatch(
      /The merge base is taken from this clone's remote-tracking refs as they stand: the gate does not fetch/
    );
  });
  it('A4: a commit after the final review returns to FINAL_REVIEW, from every state that can make one', () => {
    expect(final()).toMatch(/6\. \*\*Any commit after the final review returns here\.\*\*/);
    const outcome = section(md(), '### OUTCOME_EVAL');
    expect(outcome).not.toMatch(/then re-enter OUTCOME_EVAL\./);
  });
  it('A4: DONE counts commits after the final review under a gate marker, before the PR question', () => {
    const lines = done().split('\n');
    const check = lines.findIndex((l) => l.startsWith('3. **Commits after the final review.**'));
    const ask = lines.findIndex((l) => l.includes('Ask "Create a PR? (yes / no)."'));
    expect(check).toBeGreaterThan(0);
    expect(ask).toBeGreaterThan(check);
    expect(lines.slice(check - 2, check).map((l) => l.trim())).toContain(
      '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->'
    );
    const step = lines[check] ?? '';
    expect(step).toContain('`git rev-list --count <that head>..HEAD`');
    expect(step).toContain('ask "re-review / ship unreviewed / stop."');
    expect(step).toMatch(/`re-review`: return to FINAL_REVIEW step 1/);
    expect(step).toMatch(/This skill makes no commit of its own in DONE/);
  });
  it('the older artifact shapes are never written and have one reader', () => {
    expect(review()).toMatch(
      /No code reads them; their one reader is the labelling step of FINAL_REVIEW in this skill/
    );
  });
});

describe('review round 3: moment, base, session state and rounds (A1, A2, A3)', () => {
  const init = () => section(md(), '### INIT');
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  it('A1: the directory decides the moment; --moment is only for a directory that states none', () => {
    expect(review()).toMatch(
      /Pass no `--moment` flag and no `moment` argument for a session review directory/
    );
    expect(review()).toMatch(
      /one that agrees with the directory changes nothing, and one that disagrees fails `MOMENT_MISMATCH`/
    );
    expect(final()).toMatch(/No flag makes a receipt in `final-all` anything but a final receipt/);
    // No sentence anywhere lets the flag state the moment of a session review directory.
    expect(md()).not.toMatch(/unless `--moment/);
    expect(md()).not.toMatch(/`--moment`[^.\n]*\b(?:overrides|wins|states it instead)\b/);
  });
  it('A3: starting-commit is accepted only when no default-branch merge base resolves', () => {
    const text = final();
    expect(text).toMatch(
      /It accepts `baseSource: "starting-commit"` only when no default-branch merge base resolves AND `diff\.base` is the `startingCommit` of this session's `autopilot-state\.json`: another base fails `FINAL_BASE_NOT_MERGE_BASE`, and a receipt whose session records no full `startingCommit` fails `STARTING_COMMIT_UNKNOWN`/
    );
    expect(text).not.toMatch(/the gate then accepts the base as written/);
  });
});

describe('review round 3: the fix budget and a failed mechanical phase (A4, A5)', () => {
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  const JUDGMENT =
    '_Pause point (judgment): resolve per the Pause Protocol._ <!-- pause: judgment -->';
  const GATE = '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->';
  /** The marker lines in the three lines above the first line that contains `needle`. */
  const markersAbove = (text: string, needle: string): string[] => {
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.includes(needle));
    if (at < 0) throw new Error(`not found: ${needle}`);
    return lines
      .slice(Math.max(0, at - 3), at)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('_Pause point'));
  };
  it('A4: the fix-or-override questions stay gate pauses', () => {
    // The two pinned fix-or-override questions stay gate pauses.
    expect(markersAbove(review(), 'Blocking → ask "fix / override / stop."')).toEqual([GATE]);
    expect(markersAbove(final(), '5. Blocking: ask "fix / override / stop."')).toEqual([GATE]);
  });
  it('A4: one fix budget is shared by FINAL_REVIEW and OUTCOME_EVAL, and exhaustion is stated', () => {
    const text = final();
    expect(text).toMatch(
      /`finalReview\.retryCount` counts every `fix` taken at FINAL_REVIEW and every `fix` taken at OUTCOME_EVAL, in one counter that is never reset: three fix attempts in total/
    );
    expect(text).toMatch(/When it already stands at 3, `fix` is no longer offered at either state/);
    expect(text).toMatch(/offer "override \/ stop" only/);
    expect(section(md(), '### OUTCOME_EVAL')).toMatch(
      /the one fix budget FINAL_REVIEW step 5 describes \(three attempts shared by both states; when it is spent, `fix` is not offered here/
    );
    expect(md()).not.toMatch(/retryCount` \(max 3\)/);
  });
  it('A5: a failed mechanical phase is a red check: no reviewers, no receipt, no gate override', () => {
    const text = review();
    expect(text).toMatch(/\*\*If the mechanical phase fails, there is no review to gate\.\*\*/);
    expect(text).toMatch(
      /That is a red check, not a failed receipt gate and not a finding to override/
    );
    expect(text).toMatch(/so `override` is not offered/);
    expect(markersAbove(text, 'ask "fix / stop."')).toEqual([GATE]);
    expect(text).toMatch(/`fix`: re-enter EXECUTE with the failing checks as the work/);
  });
  it('A5: states it for both tiers, for dispatched light mode and for the pipeline backend', () => {
    const text = review();
    expect(text).toMatch(
      /- `full`, agent backend, or a session with no subagent-spawning tool: this session ran Phase 2 and saw the failure itself\. Dispatch no reviewer\./
    );
    expect(text).toMatch(
      /- `light`, dispatched: the reviewer ran Phase 2, wrote no findings file and returned a report whose first line is `MECHANICAL FAILED`, with each failing check\. Do not record it as `ran: false`\./
    );
    expect(text).toMatch(
      /- `full`, pipeline backend: `run_code_review` reported `stoppedByMechanical`\./
    );
    // The light brief tells the reviewer what to return.
    const light =
      text.split('\n').find((l) => l.includes('tier light, base {base}, head {head}')) ?? '';
    expect(light).toMatch(
      /If your Phase 2 fails \(harness validate, typecheck or tests\), write no findings file and return a report whose first line is MECHANICAL FAILED/
    );
    expect(final()).toMatch(
      /a failed mechanical phase is handled as REVIEW step 3 says: no reviewer, no receipt, no gate override, and the question "fix \/ stop"/
    );
  });
});

describe('review round 3: hooks, reviewer self-check and tier (A6 to A10)', () => {
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  it('A6: the after:REVIEW hooks are a numbered step that FINAL_REVIEW does not follow', () => {
    expect(review()).toMatch(
      /\*\*5\. Run each effective `after:REVIEW` hook\.\*\* This step belongs to REVIEW only: FINAL_REVIEW does not run it/
    );
    expect(final()).toMatch(
      /Follow REVIEW step 2 \(backend\), step 3 \(run the review, including what to do when the mechanical phase fails\) and step 4 \(write the receipt\), and no other REVIEW step: REVIEW step 5, the `after:REVIEW` hooks, is not run here/
    );
    expect(final()).not.toMatch(/Follow REVIEW steps 2 to 4 with these differences/);
  });
  it('A6: craft resolves once, at the autopilot hook point, never also at after:mechanical', () => {
    const text = records();
    expect(text).toMatch(
      /The craft domains that harness-code-review auto-wires at `after:mechanical` do \*\*not\*\* run there under autopilot/
    );
    expect(text).toMatch(
      /craft resolves once, at REVIEW step 5 \(`after:REVIEW`\) or at FINAL_REVIEW \(`after:FINAL_REVIEW`\), and its output goes to `hook-<hook name>\.json` in the review directory/
    );
    expect(text).toMatch(/Never resolve craft at both points for one review/);
    expect(text).toMatch(
      /the project's configured `skillHooks` for `harness-code-review` at `after:mechanical` are run by this session/
    );
  });
  it('A7: every reviewer brief tells the reviewer to validate its findings file before returning', () => {
    const briefs = md()
      .split('\n')
      .filter((l) => l.trim().startsWith('prompt:') && l.includes('examinedFiles'));
    expect(briefs).toHaveLength(3);
    for (const brief of briefs) {
      expect(brief).toMatch(
        /Before you return, run harness check-review-receipt --findings \{sessionDir\}\/reviews\/(?:phase-\{N\}|final-all)\/(?:compliance-bug|\{reviewerId\})\.json --base \{base\} --head \{head\}\. If it reports a code about the file's content, correct the file/
      );
      expect(brief).toContain(
        'examinedFiles lists only files that git diff --name-only --no-renames -z {base}..{head} prints and that you read'
      );
      // The file a brief checks is the file that brief tells the reviewer to write.
      const written =
        /Write only (?:your findings file, )?(\{sessionDir\}\/reviews\/[^ ]+?\.json)/.exec(
          brief
        )?.[1];
      expect(written).toBeDefined();
      expect(brief).toContain(`--findings ${written} `);
    }
    expect(records()).toMatch(
      /validates its own findings file before it returns with `harness check-review-receipt --findings \{file\} --base \{base\} --head \{head\}`/
    );
    expect(md()).not.toMatch(
      /self-check command in harness-code-review|node -e|name-only \{base\}/
    );
  });
  it('A7: a session that cannot dispatch is not in dispatched mode', () => {
    expect(review()).toMatch(
      /Run harness-code-review's single-context `light` review in this session/
    );
    expect(review()).toMatch(/This is not dispatched mode: nothing dispatched this session/);
    expect(review()).not.toMatch(/Follow harness-code-review in dispatched mode in this session/);
  });
  it('A8, round 4: no sentence says a review run supersedes another', () => {
    expect(md()).not.toMatch(/supersed/i);
  });
  it('A10: content is read as text, identity trailers only are excluded, light is the agent backend', () => {
    const text = review();
    expect(text).toMatch(
      /The diff's content is read as text whatever git attributes say, so a file marked `-diff` or `binary` cannot hide a keyword/
    );
    expect(text).toMatch(
      /identity trailers only, as harness-code-review "Review tier and dispatch" states the rule/
    );
    expect(text).toMatch(/Any other trailer is matched like the rest of the message/);
    expect(text).toMatch(
      /a `light` review always resolves to the agent backend, a rule `resolveReviewBackend` holds in core/
    );
    expect(md()).not.toMatch(/the `Key: value` lines of the last paragraph/);
  });
});

describe('review round 3: phases are numbered from 0 in every example', () => {
  it('the worked example numbers its phases 0, 1, 2 and names the matching review directories', () => {
    const examples = section(md(), '## Examples');
    const found = /(\d+) phases found/.exec(examples);
    expect(found).not.toBeNull();
    const count = Number(found?.[1]);
    const numbers = [...examples.matchAll(/\b[Pp]hase[ -](\d+)\b/g)].map((m) => Number(m[1]));
    expect(numbers.length).toBeGreaterThan(10);
    expect([...new Set(numbers)].sort()).toEqual(Array.from({ length: count }, (_, i) => i));
    // The first phase mentioned is phase 0, and no "Next:" line counts from 1.
    expect(numbers[0]).toBe(0);
    expect(examples).toContain('"Phase 0 complete. Next: 1: Rule Engine (high). Continue? → yes"');
    expect(examples).toMatch(/Phases are numbered from 0 throughout/);
  });
  it('every literal review directory and decision phase in the skill is a phase of its example session', () => {
    const text = md();
    // The session-state example is the reference: its phases are 0..n-1.
    const state = JSON.parse(
      /```json\n([\s\S]*?)```/.exec(section(text, '### INIT'))?.[1] ?? '{}'
    ) as { phases: Array<{ index: number }> };
    const outsideExamples = text.replace(section(text, '## Examples'), '');
    const literals = [
      ...outsideExamples.matchAll(/\bphase-(\d+)\b/g),
      ...outsideExamples.matchAll(/"phase": (\d+)/g),
      ...outsideExamples.matchAll(/`phase: (\d+)`/g),
    ].map((m) => Number(m[1]));
    expect(literals).toContain(0);
  });
});

describe('round 4: the review-fidelity instructions of review round 4 are each pinned', () => {
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  it('a phase base passes over a phase that was skipped or never reviewed', () => {
    expect(review()).toMatch(
      /`\{base\}` is the `diff\.head` of the receipt of the nearest earlier phase that has a usable one, passing over a phase that was skipped or whose review wrote no receipt, a receipt that cannot be read or is not a valid phase receipt, and a receipt whose `diff\.head` is not an ancestor of HEAD \(a rebase rewrote it\), and `startingCommit` when no earlier phase has a usable receipt/
    );
  });
  it('review.backend is read from the repository top, and an invalid value is an error', () => {
    expect(review()).toMatch(
      /it reads `review\.backend` from the repository top's `harness\.config\.json`, or from the file the global `-c` option names \(default `"agent"`; any other value is an error, exit 1\)/
    );
  });
  it('the reviewer ids and the self-check of a session without subagents', () => {
    expect(review()).toMatch(
      /Every reviewer id is one of the known reviewers \(the core four, the three conditional reviewers, `compliance-bug`\); any other id fails `UNKNOWN_REVIEWER`/
    );
    expect(review()).toMatch(
      /validate it with the same self-check \(`harness check-review-receipt --findings \{file\} --base \{base\} --head \{head\}`\)/
    );
  });
});

describe('unit 1 fix round 1: autopilot instructions, each pinned', () => {
  const records = () => section(md(), '### Review records');
  it('fix 5: commit or discard tracked changes before a review', () => {
    expect(records()).toMatch(
      /Before step 1 of REVIEW and of FINAL_REVIEW, commit or discard every change to a tracked file: `git status --porcelain --untracked-files=no` must print nothing\. The gate fails `WORKTREE_DIRTY` when tracked files differ from HEAD/
    );
  });
});

describe('unit 1 fix round 1: the phase base is recomputed (fix 1)', () => {
  it('REVIEW step 1 says the gate recomputes the phase base and names both codes', () => {
    expect(section(md(), '### REVIEW')).toMatch(
      /The gate recomputes this base from the same files: a phase receipt whose `diff\.base` is not it fails `PHASE_BASE_MISMATCH`, and when no base can be named \(no usable earlier receipt and no `startingCommit`, or a `startingCommit` that is not an ancestor of HEAD\) it fails `PHASE_BASE_UNKNOWN`\./
    );
  });
});

describe('unit 1 fix round 1: a demotion to light is visible (fix 3)', () => {
  const review = () => section(md(), '### REVIEW');
  it('the demotion is a marked judgment pause with a recommendation', () => {
    expect(review()).toMatch(
      /_Pause point \(judgment\): resolve per the Pause Protocol\._ <!-- pause: judgment -->\n\*\*A demotion is a decision, never silent\.\*\* When step 1 computed `full` and this session has no subagent-spawning tool, report the computed tier and its reasons and ask "run light \/ stop" \(recommendation: `run light`/
    );
  });
  it('the decision and the receipt both record the demotion, and the gate fails without it', () => {
    expect(review()).toMatch(
      /record the decision in `decisions\[\]` \(the state, the phase, `demotion: no-subagent-tool`, the computed reasons, and who decided\) and record `demotion: "no-subagent-tool"` in the receipt: a `light` receipt whose `computedTier` is `full` fails `TIER_DEMOTED` without it\./
    );
  });
  it('every receipt records the computed tier and reasons', () => {
    expect(review()).toMatch(
      /`computedTier` and `tierReasons` as step 1 printed them \(`tier` and `reasons` in `--json`; the `Review tier:` line otherwise\)/
    );
  });
  it('PHASE_COMPLETE and DONE name the demoted reviews', () => {
    expect(section(md(), '### PHASE_COMPLETE')).toMatch(
      /when it ran `light` below a computed `full` \(`demotion: "no-subagent-tool"`\), that demotion with its reasons/
    );
    expect(section(md(), '### DONE')).toMatch(
      /every review demoted to `light` below a computed `full` \(with its reasons\)/
    );
  });
});

describe('unit 1 fix round 2: a stacked branch records its target in the receipt (fix 1)', () => {
  const final = () => section(md(), '### FINAL_REVIEW');
  it('FINAL_REVIEW step 2 passes --target to the tier command and records the full ref as diff.target', () => {
    expect(final()).toMatch(
      /When this branch's PR targets another unmerged branch rather than the default branch \(a stacked PR\), add `--target <that branch's remote-tracking ref>` \(such as `origin\/feat\/parent`; a sha, a HEAD-relative name, a local branch or a tag is refused, and so is this branch's own remote-tracking branch, exactly `refs\/remotes\/<remote>\/<this branch's name>` for a configured remote, whose merge base is this branch's last pushed commit; this branch's upstream is fine when it is the parent, as it is for a branch created with `git checkout -b <branch> origin\/<parent>`\) to this command, and record the full ref it prints \(`target` in JSON, `against refs\/remotes\/…` on the `Review base:` line\) as `diff\.target` in the receipt\./
    );
    expect(final()).toMatch(
      /the gate reads the target from the receipt, so the gate step below takes no flag for it/
    );
  });
  it('the gate step passes no --target', () => {
    expect(md()).not.toMatch(/check-review-receipt[^`\n]*--target/);
  });
});

describe('unit 1 fix round 2: after a rebase, record the new starting commit (fix 2)', () => {
  it('REVIEW step 1 says what to record after a rebase, taken from review-tier', () => {
    expect(section(md(), '### REVIEW')).toMatch(
      /\*\*After a rebase\*\* \(the branch was rebased onto its target, as when the unit below it merged\), the old `startingCommit` and the earlier receipts' heads are off the branch: record the new starting commit in `autopilot-state\.json`: the merge base with the default branch, or with the target branch of a stacked branch, as the `Review base:` line of `harness review-tier --moment final` \(with the same `--target` as FINAL_REVIEW step 2\) prints it, a full 40-character sha\. The next phase review covers everything since it\./
    );
  });
});

describe('unit 1 fix round 2: after:mechanical skill hooks run in the dispatching session (fix 3)', () => {
  const records = () => section(md(), '### Review records');
  it('the orchestrating session runs them for both tiers; a light reviewer never does', () => {
    expect(records()).toMatch(
      /the project's configured `skillHooks` for `harness-code-review` at `after:mechanical` are run by this session, the one that orchestrates the review, for both tiers: a dispatched reviewer cannot dispatch, so a `light` reviewer never runs them/
    );
    expect(records()).not.toMatch(/at `after:mechanical` run there as that skill describes/);
  });
  it('their findings stay outside the receipt and its counts', () => {
    expect(records()).toMatch(
      /Their output goes to `hook-<hook name>\.json` in the review directory, and their findings stay outside the receipt and its `blocking` and `advisory` counts/
    );
  });
  it('the light brief tells the reviewer not to run them', () => {
    expect(section(md(), '### REVIEW')).toMatch(
      /Run no `skillHooks` of harness-code-review: the dispatching session runs them\./
    );
  });
});

describe('unit 1 fix round 1: the empty phase, cold-context honesty, phase numbering (fixes 2, 4, 13)', () => {
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  it('fix 2: a phase that changed nothing is not reviewed, and the next base is unchanged', () => {
    expect(review()).toMatch(
      /\*\*An empty phase is not reviewed\.\*\* When `\{base\}` equals `\{head\}`, or `git diff --name-only --no-renames -z \{base\}\.\.\{head\}` prints nothing, the phase made no change and there is nothing to review: run no review and write no receipt, record in `decisions\[\]` that the phase review was skipped as empty/
    );
    expect(review()).toMatch(
      /The next phase's base is unchanged, because a phase that wrote no receipt is passed over\. `harness review-tier` exits 1 on such a range \(`changes no files`\); that exit is this case, never a range to fix\./
    );
  });
  it('fix 4: a session that reviewed in its own context after seeing findings is not cold', () => {
    expect(review()).toMatch(
      /when this session reviewed in its own context \(no subagent-spawning tool\) and has seen the findings of any earlier review, which it always has after a fix, `coldContext: false` and `priorFindingsSupplied: true`/
    );
    expect(final()).toMatch(
      /A session that reviews in its own context has seen the phase reviews' findings, so it records `coldContext: false` and `priorFindingsSupplied: true` here;/
    );
  });
  it('fix 13: Phase N in prompts is the 0-based review-directory number; spec headings are 1-based', () => {
    expect(review()).toMatch(
      /`Phase \{N\}` in every prompt and report below is that same 0-based number, matching the review directory; the spec's `### Phase N:` headings are numbered from 1, so the spec's Phase 1 is `Phase 0` and `phase-0` here\./
    );
  });
  it('fix 13: the pipeline backend writes a file for every required reviewer', () => {
    expect(review()).toMatch(
      /Every required reviewer gets a file, with `findings: \[\]` when its domain returned nothing\./
    );
  });
});

describe('unit 1 fix round 1: a spent fix budget with a red mechanical phase', () => {
  it('offers stop and says how a hand-made fix resumes', () => {
    expect(section(md(), '### FINAL_REVIEW')).toMatch(
      /When that budget is already spent, `fix` is not offered: report the failing checks and that the budget is spent, and offer `stop`; a fix the human commits by hand, followed by a resume, re-enters FINAL_REVIEW at step 1\./
    );
  });
});

describe('unit 1 fix round 2: suggestions folded in', () => {
  it('DONE step 3 says what an absent or unreadable final receipt means', () => {
    expect(section(md(), '### DONE')).toMatch(
      /When that receipt is absent, unreadable or holds no full `diff\.head` \(FINAL_REVIEW was left by an override of `RECEIPT_MISSING` or `RECEIPT_INVALID`\), every commit of the branch is unreviewed/
    );
  });
});

describe('unit 1 review round 3, fix 2 (round 4: one Retry table): a failed gate is re-run per code', () => {
  it('REVIEW and FINAL_REVIEW both send re-run to the Retry table', () => {
    const rule =
      '`re-run`: act on every failure as the Retry table says (Review records, Retry); when a code there says stop for the human, `re-run` is not offered.';
    expect(section(md(), '### REVIEW')).toContain(rule);
    expect(section(md(), '### FINAL_REVIEW')).toContain(rule);
  });
});

describe('unit 1 review round 3, fix 9: one rule for blocking findings VALIDATE discarded', () => {
  // Unit 3 adds the third way: a recorded dismissal. Nothing is cleared without a record.
  it('Counts: every blocking finding of a reviewer file is fixed, overridden or dismissed by a record', () => {
    expect(section(md(), '### Review records')).toMatch(
      /never clear a blocking finding on their own: \*\*every blocking finding a reviewer file holds is fixed, overridden by the human, or dismissed by a recorded decision\*\* \(Decision records, below\), including one VALIDATE judged a false positive \(it is proposed for dismissal, never dropped\)/
    );
  });
  it('REVIEW step 8 decides on the receipt count less the recorded dismissals, not on the validated list', () => {
    const review = section(md(), '### REVIEW');
    expect(review).toMatch(
      /\*\*8\. Decide on the blocking findings\*\* that remain: every blocking finding of the reviewer findings files \(the receipt's `blocking`\) that step 7 did not dismiss, whatever VALIDATE judged of it/
    );
    expect(review).toMatch(
      /No blocking \(every blocking finding of the receipt was dismissed in step 7, or there was none, and no hook finding blocks\) → PHASE_COMPLETE/
    );
    expect(review).not.toMatch(/the validated reviewer findings/);
  });
  it('FINAL_REVIEW step 4 never gives a status while the receipt counts a blocking finding that was not dismissed', () => {
    const final = section(md(), '### FINAL_REVIEW');
    expect(final).toMatch(
      /when no blocking finding remains \(every blocking finding of the receipt was dismissed, or there was none, and no hook finding blocks\), store the findings/
    );
    expect(final).toMatch(
      /A final review whose receipt still counts a blocking finding that was not dismissed is never given a status here, whatever VALIDATE judged of the finding: it goes to step 5, where it is fixed or the human's override is recorded in `decisions\[\]`/
    );
  });
});

describe('unit 1 review round 3, fix 10: entry points from build output', () => {
  it('a field that points into a build directory names its source', () => {
    expect(section(md(), '### REVIEW')).toMatch(
      /a field that points into a build directory, `dist\/`, `build\/`, `lib\/` or `out\/`, names its source under `src\/` with the same stem/
    );
  });
});

describe('unit 1 review round 4, fix 5: an empty final review is skipped and recorded', () => {
  it('FINAL_REVIEW step 2 skips an empty final range with a recorded decision', () => {
    expect(section(md(), '### FINAL_REVIEW')).toMatch(
      /\*\*An empty final range is not reviewed\.\*\* When the command exits 1 with `the final range <base>\.\.<head> is empty \(it changes no files\)`, the branch changes nothing against its base and there is nothing to review: run no review and write no receipt, record in `decisions\[\]` that the final review was skipped as empty \(the state `FINAL_REVIEW`, that base and that head\), set `finalReview\.status: "skipped-empty"` and go to OUTCOME_EVAL\. That exit is this case, never a range to fix\./
    );
  });
  it('FINAL_REVIEW step 2 takes {head} from the Review head: line', () => {
    expect(section(md(), '### FINAL_REVIEW')).toMatch(
      /`\{head\}` is the `Review head:` line, the commit the base was computed at \(`head` in JSON\)/
    );
  });
  it('DONE reports a skipped-empty final review and counts commits from its recorded head', () => {
    const done = section(md(), '### DONE');
    expect(done).toMatch(
      /`finalReview\.status` \(`passed`, `passed-with-dismissals`, `overridden` or `skipped-empty`\)/
    );
    expect(done).toMatch(
      /When the final review was skipped as empty, count from the head its decision recorded: `git rev-list --count <that head>\.\.HEAD`\./
    );
  });
});

describe('unit 1 review round 4, fix 4: a reviewer never edits its file for a range or tree code', () => {
  const RULE =
    "If it reports a code about the file's content, correct the file and run it again until it prints PASS. If it reports HEAD_MISMATCH, WORKTREE_DIRTY, EMPTY_DIFF, DIFF_UNRESOLVED or any other code that is not about the file's content, do not edit the file: stop and report the code to the dispatching session. State the result.";
  it('every reviewer brief (REVIEW light and full, FINAL_REVIEW) carries the rule', () => {
    const count = md().split(RULE).length - 1;
    expect(count).toBe(3);
    expect(md()).not.toMatch(/correct what it reports until it prints PASS/);
  });
  it('Review records, Who writes what, states it', () => {
    expect(section(md(), '### Review records')).toMatch(
      /The reviewer corrects its file only for a code about the file's content; for `HEAD_MISMATCH`, `WORKTREE_DIRTY`, `EMPTY_DIFF`, `DIFF_UNRESOLVED` or any other code that is not about the file's content it edits nothing and reports the code to this session, which fixes the range or the tree \(Clean tree; REVIEW step 1; FINAL_REVIEW step 2\) and dispatches the reviewer again\./
    );
  });
});

describe('unit 1 review round 4, suggestion: one Retry table covers every gate code', () => {
  const rows = () => {
    const text = section(md(), '### Review records');
    const out = new Map<string, string>();
    for (const line of text.split('\n')) {
      const m = /^\| `([A-Z_]+)`\s*\| (.+?)\s*\|$/.exec(line);
      if (m) out.set(m[1]!, m[2]!);
    }
    return out;
  };
  it('every REVIEW_GATE_FAILURE_CODES code has exactly one row, and no other code does', () => {
    expect([...rows().keys()].sort()).toEqual([...REVIEW_GATE_FAILURE_CODES].sort());
  });
  it('each row starts with one of the actions, or names its own repair', () => {
    for (const [code, action] of rows()) {
      expect(action, code).toMatch(
        /re-run all|re-run named|rewrite receipt|stop for the human|run the gate again|correct the tool call|no review: skip as empty/
      );
    }
  });
  it('range and tree codes re-run all; receipt-writing slips rewrite the receipt', () => {
    const r = rows();
    for (const code of [
      'HEAD_MISMATCH',
      'WORKTREE_DIRTY',
      'DIFF_BASE_NOT_ANCESTOR',
      'PHASE_BASE_MISMATCH',
    ])
      expect(r.get(code), code).toMatch(/re-run all/);
    for (const code of ['COUNTS_MISMATCH', 'RECEIPT_INVALID', 'DUPLICATE_REVIEWER'])
      expect(r.get(code), code).toMatch(/^rewrite receipt/);
    expect(r.get('DUPLICATE_FINDING_ID')).toMatch(
      /re-run named: the reviewers whose files hold a repeated id/
    );
    expect(r.get('EMPTY_DIFF')).toMatch(/skip as empty/);
  });
});

/**
 * Unit 3 (provenance stamp): the session-state contract, typed review decisions with rounds and
 * deciders, dismissals as a judgment pause, the stamp in the PR body, and what it prints. Ported
 * from the reference branch's skill tests, with the later units' assertions left out.
 */
describe('unit 3: review decisions and the provenance stamp', () => {
  const init = () => section(md(), '### INIT');
  const records = () => section(md(), '### Review records');
  const review = () => section(md(), '### REVIEW');
  const final = () => section(md(), '### FINAL_REVIEW');
  const done = () => section(md(), '### DONE');
  const JUDGMENT =
    '_Pause point (judgment): resolve per the Pause Protocol._ <!-- pause: judgment -->';
  const GATE = '_Pause point (gate): resolve per the Pause Protocol._ <!-- pause: gate -->';
  const markersAbove = (text: string, needle: string): string[] => {
    const lines = text.split('\n');
    const at = lines.findIndex((l) => l.includes(needle));
    if (at < 0) throw new Error(`not found: ${needle}`);
    return lines
      .slice(Math.max(0, at - 3), at)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('_Pause point'));
  };
  const stampOf = (...rows: string[]) =>
    [
      PROVENANCE_MARKER,
      '### Review provenance',
      '',
      `| ${['Review', 'Moment', 'Tier', 'Backend', 'Reviewers', 'Diff', 'Coverage', 'Gate', 'Blocking', 'By class', 'Escaped from', 'Override'].join(' | ')} |`,
      `| ${Array.from({ length: 12 }, () => '---').join(' | ')} |`,
      ...rows,
      '',
      PROVENANCE_MARKER,
    ].join('\n');

  it('records a gate override in decisions[] in the shape the stamp reads', () => {
    expect(review()).toMatch(
      /the provenance stamp shows the failed gate as overridden only while every code it fails with is listed/
    );
    expect(review()).toContain(
      '`override`: record a `kind: "gate"` decision for this phase in `decisions[]`, in the shape Review records, Decision records, gives, with the round of this review, `decidedBy: "human"` (a gate pause never auto-resolves) and `codes` listing every failure code the gate raised'
    );
    expect(review()).toContain(
      '`override`: record a `kind: "findings"` decision for this phase in `decisions[]`, in the shape Review records, Decision records, gives, with the round of this review and `decidedBy: "human"` → PHASE_COMPLETE.'
    );
    expect(final()).toContain(
      '`override`: record a `kind: "gate"` decision with `state: "FINAL_REVIEW"`, the round of this review and `decidedBy: "human"` in `decisions[]`'
    );
    // No inline literal of the older shapes is left anywhere in the skill.
    expect(md()).not.toMatch(/chosen: "override", (?:kind: "gate", )?(?:question|rationale):/);
  });
  it('renders the stamp and places it verbatim in the PR body', () => {
    const text = done();
    expect(text).toContain('harness review-provenance render --session <session-slug>');
    expect(text).toContain('<!-- harness:review-provenance -->');
    expect(text).toMatch(/verbatim in the PR body, with an empty line above and below it/);
    const lines = text.split('\n');
    const ask = lines.findIndex((l) => l.includes('Ask "Create a PR? (yes / no)."'));
    expect(lines[ask + 1]).toMatch(
      /^\s+- \*\*Provenance stamp\.\*\* Before writing the PR body, run/
    );
    expect(text).toMatch(/one row per review/);
    expect(text).toMatch(
      /the receipt gate's result \(re-run by the command: `pass at <sha>`, or `FAIL` with its codes\)/
    );
    expect(text).toMatch(/reviewers whose findings file loaded of required/);
    expect(text).toMatch(
      /Do not edit a row, the heading or the markers, and do not wrap the block in an HTML comment: a `FAIL` on the stamp is the record/
    );
  });
  it('never omits the stamp silently when the command fails', () => {
    expect(done()).toContain('Review provenance unavailable (<reason>)');
    expect(done()).toMatch(/never leave it out silently/);
  });
  it('a fix round keeps the earlier totals on the stamp, and a decision keeps its round', () => {
    expect(records()).toMatch(/The stamp keeps the earlier totals in its Blocking column/);
    expect(records()).toMatch(
      /A decision of an earlier round therefore never applies to the new receipt: it carries the earlier round's number/
    );
    expect(records()).toMatch(/A review decision taken in round `R` carries `"round": R`/);
  });
  it('A6: the three decision kinds, their fields, and what an unreadable record does to the stamp', () => {
    const text = records();
    for (const kind of ['gate', 'findings', 'dismissed']) {
      expect(text, kind).toContain(`"kind": "${kind}"`);
    }
    expect(text).toMatch(
      /`phase` is required for `REVIEW` and is the phase's 0-based position in `phases\[\]`/
    );
    expect(text).toMatch(/`rationale` is a non-empty string for every kind/);
    expect(text).toMatch(/`codes` \(kind `gate`\) lists every failure code the gate raised/);
    expect(text).toMatch(/an override taken for one failure does not cover another raised later/);
    expect(text).toMatch(
      /The stamp then prints `overrides could not be read from autopilot-state\.json` and shows `unknown`, not `none`, in the Override column of every review that has no readable decision, a row with no receipt \(`MISSING`, `receipt missing`\) included/
    );
    expect(text).toMatch(/the shape earlier versions of this skill wrote/);
  });
  it('A6: a blocking finding that is not fixed is overridden or dismissed, with ids and a reason', () => {
    const text = records();
    expect(text).toMatch(
      /\*\*Every blocking finding in a reviewer file ends one of three ways\*\* before its review state is left/
    );
    expect(text).toMatch(
      /For each finding the answer dismisses, record one `dismissed` decision with its `findingIds`, the reason as `rationale`, the round of the review and `decidedBy`/
    );
    expect(text).toMatch(/The finding still counts: the stamp shows it as `3 \(2 dismissed\)`/);
    expect(text).toMatch(/They never edit a findings file, never change these counts/);
    expect(review()).toMatch(
      /REVIEW is never left with a blocking finding of a reviewer file that was neither sent to fix, nor covered by that override, nor dismissed in step 7/
    );
    expect(final()).toMatch(
      /Record one `kind: "dismissed"` decision for what the answer dismisses, with `state: "FINAL_REVIEW"`, the round of this review and `decidedBy`/
    );
  });
  it('the stamp description names the cells and what a rebase does', () => {
    const text = done();
    expect(text).toMatch(/`MISSING` for a review that has no directory/);
    expect(text).toMatch(/coverage \(the diff files a required reviewer examined\)/);
    expect(text).toMatch(
      /a rebase, an amend or a squash after the reviews makes every row read `FAIL: HEAD_MISMATCH`/
    );
    expect(text).toMatch(
      /nothing authenticates it in a PR body: CI cannot recompute it, because the receipts stay on this machine/
    );
  });
  it('A2: INIT states the phases[] entry it writes, with index as the 0-based position', () => {
    const text = init();
    expect(text).toMatch(
      /INIT writes each `phases\[\]` entry as `\{ index, name, complexity, status, planPath \}`/
    );
    expect(text).toMatch(/`index` is the entry's 0-based position in the list/);
    expect(text).toMatch(
      /\*\*One number names a phase: its 0-based position in `phases\[\]`\.\*\* `index`, `currentPhase`, the `N` of the review directory `reviews\/phase-N\/`, the `phase` of a review decision record/
    );
    expect(text).toMatch(/The first phase is phase 0\./);
    expect(text).toMatch(/The number in a spec heading is never used as an identifier/);
    expect(text).toMatch(/Never move or delete an entry after INIT/);
    expect(text).toContain('`AutopilotSessionState` and `AutopilotPhaseEntry`');
    // Unit 3, architecture-session-state-schema-unused: one schema, one reader, read once.
    expect(text).toMatch(
      /schema `AutopilotSessionStateSchema` in `@harness-engineering\/core`; the review commands read it once per run, through one reader that applies that schema field by field/
    );
    expect(text).toMatch(
      /`startingCommit` is the full 40-character sha\. A value that is not one is read as no starting commit/
    );
  });
  it('A2: says what the stamp prints for a wrong index, in the words the renderer writes', () => {
    const note = noteText({ id: 'expected-unknown-phase-index', args: { n: 7 } });
    expect(note).toContain('phase entry 7 states an index other than its 0-based position');
    expect(init()).toContain(`\`${note.replace('entry 7', 'entry N')}\``);
    const malformed = noteText({ id: 'expected-unknown-phase-entry', args: { n: 7 } });
    expect(init()).toContain(
      /\(phase entry 7 is malformed\)/.exec(malformed)![0].replace('7', 'N')
    );
    expect(init()).toMatch(/it can then show no `MISSING` row/);
  });
  it('A2: a decision carries its round and applies only to the receipt of that round', () => {
    const text = records();
    expect(text).toMatch(
      /`round` is the round of the review the decision was taken in: 1 \+ the `round-R\/` archives in its review directory, which is the receipt's `round` when it has one that passed the round check\. Write it on every record/
    );
    expect(text).toMatch(
      /A decision applies only to the receipt of its own round: an override or a dismissal taken in round 1 does nothing to the round 2 receipt/
    );
    expect(text).toMatch(/A record with no `round` is read as round 1/);
    expect(text).toMatch(/`1 from other rounds`/);
    expect(text).toMatch(/for that review and round/);
  });
  it('A2: says what the stamp prints for an orphan decision, in the words the renderer writes', () => {
    const text = records();
    expect(text).toContain(
      `\`${noteText({ id: 'orphan-label', args: { n: 1, label: 'phase-1' } })}\``
    );
    expect(text).toContain(
      `\`${noteText({ id: 'orphan-state', args: { kind: 'dismissed', state: 'DONE' } })}\``
    );
    expect(text).toMatch(/A decision for the first phase carries `"phase": 0`/);
    expect(text).toMatch(/a `codes` entry that is not one of the gate's failure codes/);
  });
  it('A4: dismissing a blocking finding is a judgment pause with a recommendation', () => {
    const text = records();
    expect(markersAbove(text, '**A dismissal is a decision')).toEqual([JUDGMENT]);
    expect(text).toMatch(/VALIDATE and DEDUP only _propose_/);
    expect(text).toMatch(/states a recommendation for each \(dismiss, or keep as blocking\)/);
    expect(text).toMatch(/In supervised mode the human answers/);
    expect(text).toMatch(
      /In trusted mode a dismissal is taken without the human only when the blind-then-refute self-audit actually ran and agreed and `record_auto_decision` returned `recorded: true` with audit status `agreed`; such a record carries `decidedBy: "audited"`/
    );
    expect(text).toMatch(
      /In every other case the question goes to the human, at every autonomy level, and the answer is recorded with `decidedBy: "human"`: when the audit disagreed or raised a blocking objection, when this session cannot spawn the auditor \(its tool list has no subagent-spawning tool\), when audit is off, and when `record_auto_decision` refused the entry/
    );
    expect(text).toMatch(
      /The Pause Protocol's audit statuses `unavailable` and `off` let some other judgment forks proceed; they never let a dismissal of a blocking finding proceed, because neither is an audit that agreed/
    );
    expect(text).toMatch(/A dismissal is never written as `unaudited`/);
    expect(text).toMatch(/No `dismissed` record is written before the question is answered/);
    expect(text).toMatch(/running out of fix attempts is never a reason to dismiss/);
  });
  it('A4: REVIEW step 7 and FINAL_REVIEW step 4 are that pause, each under a judgment marker', () => {
    expect(markersAbove(review(), '**7. Settle dismissals.**')).toEqual([JUDGMENT]);
    expect(markersAbove(final(), '4. Settle dismissals, then set the status.')).toEqual([JUDGMENT]);
    expect(review()).toMatch(/with `phase: \{N\}`, the round of this review and `decidedBy`/);
    // The two pinned fix-or-override questions stay gate pauses.
    expect(markersAbove(review(), 'Blocking → ask "fix / override / stop."')).toEqual([GATE]);
    expect(markersAbove(final(), '5. Blocking: ask "fix / override / stop."')).toEqual([GATE]);
  });
  // compliance-final-status-passed-after-gate-override and
  // adversarial-final-status-passed-after-earlier-round-dismissal.
  it('A4: the final status counts every decision of the final review, in every round', () => {
    const text = final();
    expect(text).toMatch(
      /set `finalReview\.status` from every review decision recorded with `state: "FINAL_REVIEW"`, in this round and in every earlier round of the final review:/
    );
    expect(text).toMatch(
      /- `"overridden"` when any of them is a `gate` or a `findings` override: a final review whose receipt gate failed and was overridden is never `"passed"`, even with no blocking finding;/
    );
    expect(text).toMatch(
      /- `"passed-with-dismissals"` when there is no override and any of them is a `dismissed` decision, in any round: a final review in which a blocking finding was dismissed is never `"passed"`, even when a later round did not raise that finding again;/
    );
    expect(text).toMatch(
      /- `"passed"` only when there is none: nothing of the final review was set aside\./
    );
    expect(done()).toMatch(
      /`finalReview\.status` \(`passed`, `passed-with-dismissals`, `overridden` or `skipped-empty`\)/
    );
    expect(done()).toMatch(/every override and, beside the overrides, every dismissal/);
    expect(section(md(), '## Success Criteria')).toMatch(
      /a final review ends `passed` only when nothing of it was set aside in any round: `passed-with-dismissals` with a dismissal, `overridden` with a gate or findings override/
    );
  });
  it('A9: the stamp cell forms are the ones the parser accepts', () => {
    const text = records();
    const stamp = text.slice(text.indexOf('**What the stamp prints.**'));
    for (const form of [
      '`receipt missing`',
      '`receipt invalid`',
      '`receipt unreadable (<reason>)`',
      '`, +M more`',
      '`, +N commits not reviewed`',
      '`, +? commits not reviewed (count unavailable)`',
      '`(gap: base is not the head phase-N reviewed)`',
      '`(gap: base is not the session starting commit)`',
      '`; +N more`',
      'ends with `…`',
      'on a passing row, a failing row and an overridden row alike',
      'The counts are never cut',
      '`, 1 unaudited` and `, 1 decider unknown`',
      '`MISSING (overridden)`',
      '` (overridden)` when a `gate` decision recorded for that review lists the code the row fails with',
      'passed over, not a reset',
      '`at least 3; not loaded: bug`',
      '`unknown` when they could not be read',
    ]) {
      expect(stamp, form).toContain(form);
    }
    expect(records()).toContain(
      'The stamp writes the decider after every decision, `(human)`, `(audited)` or `(unaudited)`'
    );
    expect(records()).toContain(
      `\`${noteText({ id: 'decisions-legacy', args: { n: 1 } }).replace('1 review', 'N review')}\``
    );
    // The cell forms are cells the PR-body parser keeps.
    for (const row of [
      '| phase-1 | - | - | - | - | - | - | MISSING (overridden) | - | - | - | 1 override, 0 dismissals: gate (RECEIPT_MISSING) (human): phase 1 was docs only |',
      '| phase-0 | phase | full | agent | 4/4 | 0000001..0000002 | 1/1 files | pass at 0000002 | 2 (1 dismissed, 1 unaudited) | design 1 | plan 1 | 0 overrides, 1 dismissal: dismissed bug-x (unaudited): x |',
      '| phase-0 | phase | full | agent | 3/4 | 0000001..0000002 | 1/1 files | FAIL: FINDINGS_FILE_MISSING | at least 3; not loaded: bug | design 3 | plan 3 | none |',
      '| phase-2 | - | - | - | - | - | - | MISSING | - | - | - | unknown |',
    ]) {
      expect(parseProvenanceStamp(stampOf(row))?.rows, row).toHaveLength(1);
    }
    // The Override examples, with a rationale filled in, are cells the PR-body parser keeps.
    const overrides = [...stamp.matchAll(/`(\d+ overrides?, \d+ dismissals?[^`]*)`/g)].map((m) =>
      (m[1] ?? '').replaceAll('<rationale>', 'accepted for this phase').replace(' …', ' x')
    );
    expect(overrides.length).toBeGreaterThanOrEqual(2);
    for (const cell of overrides) {
      const row = `| phase-0 | phase | full | agent | 4/4 | 0000001..0000002 | 1/1 files | FAIL: REQUIRED_REVIEWER_NOT_RUN (overridden) | 2 (1 dismissed) | design 1 | plan 1 | ${cell} |`;
      expect(parseProvenanceStamp(stampOf(row))?.rows, cell).toHaveLength(1);
    }
    // Control: free text that is not inert makes the same row not a row.
    const bad = `| phase-0 | phase | full | agent | 4/4 | 0000001..0000002 | 1/1 files | pass at 0000002 | 0 | none | none | 1 override, 0 dismissals: findings (human): see https://x.example |`;
    expect(parseProvenanceStamp(stampOf(bad))?.rows).toHaveLength(0);
  });
  // security-hidden-stamp-link-definition: the rule is stated in terms of what renders.
  it('A9: a stamp is read back only as a reader of the rendered page sees it', () => {
    expect(records()).toMatch(
      /A stamp is read back out of a PR body only as a reader of the rendered page sees it: the opening marker on a line of its own after an empty line \(or at the very start\), the heading `### Review provenance` on the next line, the table under it and then its notes, and the closing marker on a line of its own after an empty line, none of it inside an HTML comment, a code block or a raw HTML block\. A marker anywhere else \(in a paragraph, a list item, a quote, a link reference definition\) is text/
    );
    const text = done();
    expect(text).toMatch(/opening with the heading `### Review provenance`/);
    expect(text).toMatch(
      /a directory without a readable receipt is a row whose Gate cell says `receipt missing`, `receipt invalid` or `receipt unreadable \(<reason>\)`/
    );
    expect(text).toMatch(
      /the Override cell, which starts with the number of overrides and dismissals/
    );
    expect(text).toMatch(
      /will end `, \+N commits not reviewed` after its gate result, whether that result is a pass, a failure or an overridden failure/
    );
    expect(text).toMatch(
      /with no review `kind`: a `kind` under that state would be an orphan decision/
    );
    // The parser agrees: a marker pair without the heading is not a stamp, and neither is a
    // stamp glued to the paragraph above it.
    const row =
      '| phase-0 | phase | light | agent | 1/1 | 0000001..0000002 | 1/1 files | pass at 0000002 | 0 | none | none | none |';
    expect(parseProvenanceStamp([PROVENANCE_MARKER, row, PROVENANCE_MARKER].join('\n'))).toBe(
      undefined
    );
    expect(parseProvenanceStamp(`text above\n${stampOf(row)}`)).toBe(undefined);
    expect(parseProvenanceStamp(`text above\n\n${stampOf(row)}`)?.rows).toHaveLength(1);
  });
  // compliance-decidedby-parser-claim: the skill says what the reader does.
  it("this skill writes only human and audited, overrides are always the human's, and a record with no decidedBy is read as unknown", () => {
    expect(records()).toMatch(
      /This skill writes only `human` and `audited`, and `audited` only for a dismissal \(the next paragraphs say when\); a `gate` or `findings` override is always the human's/
    );
    expect(records()).toMatch(
      /A `decidedBy` of any other value, `unknown` included, makes the record unreadable\. A record with no `decidedBy` key at all \(written before the field existed\) that is otherwise valid is read, as decided by `unknown`/
    );
    expect(records()).not.toMatch(/The parser refuses a record without the field/);
  });
  // security-decision-passthrough-json-crash: other fields are not carried.
  it('other fields of a decision are never read and never reach the stamp', () => {
    expect(records()).toMatch(
      /The reader keeps only these fields\. Others \(`chosen`, `at`\) may be added; they are never read and never reach the stamp or its JSON/
    );
  });
  it('free text on the stamp is inert, issue references, math and invisible characters included', () => {
    expect(records()).toMatch(
      /invisible and control characters are removed, `#` and `GH-` before a digit get a space after them, `@` becomes `\(at\)`, and `\$`, `;`, the backtick and the markup characters are written as numeric character references/
    );
  });
  it('the summaries say who may dismiss', () => {
    expect(md()).toMatch(
      /settle proposed dismissals \(a `judgment` decision, never this session's alone: the human's, or taken after a self-audit that ran and agreed\)/
    );
    expect(section(md(), '## Success Criteria')).toMatch(
      /carrying its `round` and `decidedBy`; a dismissal was answered by the human, or in trusted mode taken after a self-audit that ran and agreed \(`audited`\), before it was recorded/
    );
  });
});
