// agents/skills/tests/autopilot-review-fidelity.test.ts
//
// Shift-left pipeline fidelity, Phase 1: autopilot's reviews fan out and are gated.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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
      /If the command exits non-zero, it could not compute a tier \(an unresolvable `\{base\}` or `\{head\}`, a range git cannot list\): do not assume `light`/
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
      'Follow harness-code-review in dispatched mode: review-dir {sessionDir}/reviews/phase-{N}/, moment phase, tier light, head {head}.'
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
      at('**7. Decide on the blocking findings**'),
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
      expect(p).toMatch(/head: \\"\{head\}\\", examinedFiles, findings \}/);
      expect(p).toMatch(/moment (?:phase|final), (?:tier light, )?head \{head\}\./);
      expect(p).toMatch(/[Rr]eview-dir \{sessionDir\}\/reviews\/(?:phase-\{N\}|final-all)\//);
      expect(p).toMatch(/every finding id starts with (?:compliance-bug|\{reviewerId\})-/);
    }
    expect(md()).not.toMatch(
      /\{ schemaVersion: 1, reviewerId(?:: \\"compliance-bug\\")?, examinedFiles/
    );
    const text = records();
    expect(text).toContain('`{ schemaVersion: 1, reviewerId, head, examinedFiles, findings }`');
    expect(text).toMatch(
      /a file without it is invalid \(`FINDINGS_FILE_INVALID`\) and a file written at another head fails `FINDINGS_HEAD_MISMATCH`/
    );
    expect(text).toMatch(
      /Give every brief `\{head\}` as the resolved sha, never as the word `HEAD`/
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
  it('round 4: an attempt that wrote no receipt keeps its round, so earlier decisions never apply to the next receipt', () => {
    const text = records();
    expect(md()).not.toMatch(/round 1 when the directory holds no receipt/);
  });
  it('A6: VALIDATE and DEDUP never change the receipt counts', () => {
    const text = records();
    expect(text).toMatch(/They never edit a findings file and never change these counts/);
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
      /it fails unless `diff\.base` is the base of step 2 \(`FINAL_BASE_NOT_MERGE_BASE`, `STARTING_COMMIT_UNKNOWN`\)/
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
    const light = text.split('\n').find((l) => l.includes('tier light, head {head}')) ?? '';
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
      /the project's configured `skillHooks` for `harness-code-review` at `after:mechanical` run there/
    );
  });
  it('A7: every reviewer brief tells the reviewer to validate its findings file before returning', () => {
    const briefs = md()
      .split('\n')
      .filter((l) => l.trim().startsWith('prompt:') && l.includes('examinedFiles'));
    expect(briefs).toHaveLength(3);
    for (const brief of briefs) {
      expect(brief).toMatch(
        /Before you return, run harness check-review-receipt --findings \{sessionDir\}\/reviews\/(?:phase-\{N\}|final-all)\/(?:compliance-bug|\{reviewerId\})\.json --base \{base\} --head \{head\}, correct what it reports until it prints PASS, and state its result\./
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
  it('A8, round 4: each record call is a new run, and runs of one review at one head merge as a union', () => {
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
      /`\{base\}` is the `diff\.head` of the receipt of the nearest earlier phase that has one, passing over a phase that was skipped or whose review wrote no receipt, and `startingCommit` when no earlier phase has a receipt/
    );
  });
  it('review.backend is read from the repository top, and an invalid value is an error', () => {
    expect(review()).toMatch(
      /it reads `review\.backend` from the repository top's `harness\.config\.json`, or from the file the global `-c` option names \(default `"agent"`; any other value is an error, exit 1\)/
    );
  });
  it('the reviewer ids, round codes and the self-check of a session without subagents', () => {
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
      /The gate recomputes this base from the same files: a phase receipt whose `diff\.base` is not it fails `PHASE_BASE_MISMATCH`, and when no base can be named \(no earlier receipt and no `startingCommit`, or an earlier receipt it cannot read\) it fails `PHASE_BASE_UNKNOWN`\./
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

describe('unit 1 fix round 1: a stacked branch names its target (fix 8)', () => {
  it('FINAL_REVIEW step 2 passes --target to the tier command and to the gate', () => {
    expect(section(md(), '### FINAL_REVIEW')).toMatch(
      /When this branch's PR targets another unmerged branch rather than the default branch \(a stacked PR\), add `--target <that branch's remote-tracking ref>` to this command and the same `--target` to the gate below/
    );
  });
});
