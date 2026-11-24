// agents/skills/tests/code-review-receipts.test.ts
//
// Shift-left pipeline fidelity, Phase 1 (unit 1): harness-code-review emits receipts and gates them.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse as parseYaml } from 'yaml';
import {
  REVIEW_GATE_FAILURE_CODES,
  checkReviewerFindingsText,
  selectReviewTier,
} from '@harness-engineering/core';

const SKILL_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'claude-code',
  'harness-code-review'
);
export const md = () => readFileSync(resolve(SKILL_DIR, 'SKILL.md'), 'utf-8');

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

/** The gate failure table of the Review Receipt section: code -> the "fails when" cell. */
export function gateFailureRows(receiptSection: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const line of receiptSection.split('\n')) {
    const m = /^\| `([A-Z_]+)` +\| (.*?) *\|$/.exec(line);
    if (m) rows.set(m[1]!, m[2]!);
  }
  return rows;
}

const CLASSES = ['stale-claim', 'edge-case', 'weak-test', 'collateral', 'design', 'other'];
const STAGES = ['spec', 'plan', 'execution', 'verification', 'none'];

describe('attribution rubric (SC7)', () => {
  const rubricPath = resolve(SKILL_DIR, 'references', 'attribution-rubric.md');
  it('exists and defines every finding class and every escaped-from stage', () => {
    expect(existsSync(rubricPath)).toBe(true);
    const rubric = readFileSync(rubricPath, 'utf-8');
    for (const c of CLASSES) expect(rubric, c).toContain(`\`${c}\``);
    for (const s of STAGES) expect(rubric, s).toContain(`\`${s}\``);
    expect(rubric).toMatch(/earliest stage/);
  });
  it('the Finding Schema shows both fields with exactly the shared vocabulary', () => {
    const schema = section(md(), '### Finding Schema');
    expect(schema).toContain(`findingClass?: ${CLASSES.map((c) => `'${c}'`).join(' | ')};`);
    expect(schema).toContain(`escapedFrom?: ${STAGES.map((s) => `'${s}'`).join(' | ')};`);
    expect(schema).toContain('references/attribution-rubric.md');
    expect(schema).toMatch(/every `critical` or `important` finding/);
  });
});

describe('review tiers and dispatched mode (SC5, SC15)', () => {
  const fanOut = () => section(md(), '### Phase 4: FAN-OUT');
  it('no longer promises four parallel subagents unconditionally', () => {
    expect(fanOut()).not.toMatch(/Run four parallel review subagents/);
    expect(fanOut()).toContain('#### Review tier and dispatch');
  });
  it('no text outside Phase 4 still says the four base reviewers run in every review', () => {
    const text = md();
    // Phase 3.5: the calibration gates only the conditional reviewers of a full review.
    const calibrate = section(text, '### Phase 3.5: CALIBRATE DEPTH');
    expect(calibrate).not.toMatch(/4 agents always run/);
    expect(calibrate).not.toMatch(/always run/);
    expect(calibrate).toMatch(/In a `full` review the four base reviewers/);
    expect(calibrate).toMatch(/A `light` review runs one reviewer, `compliance-bug`/);
    // The pipeline phase table and the Phase 4 exit name both tiers.
    const row = text.split('\n').find((l) => l.startsWith('| 4. FAN-OUT     | mixed')) ?? '';
    expect(row).toMatch(/`full`: 4 base \+ N conditional; `light`: 1/);
    expect(text).not.toMatch(/Parallel review subagents \(4 base \+ N conditional\)/);
    expect(text).not.toContain('**Exit:** All base agents + active conditional subagents');
    expect(text).not.toContain('Context bundles assembled for all four domains.');
  });
  it('the worked example says it shows a full review', () => {
    const example = section(md(), '### Example: Pipeline Review of a New API Endpoint');
    expect(example).not.toMatch(/\*\*Phase 4 \(FAN-OUT\):\*\* Four agents in parallel:/);
    const line = example.split('\n').find((l) => l.startsWith('**Phase 4 (FAN-OUT):**')) ?? '';
    expect(line).toMatch(/This example shows a `full` review/);
    expect(line).toMatch(/A `light` review would show one `compliance-bug` reviewer/);
  });
  it('defines light as one reviewer and full as one dispatch per reviewer', () => {
    const tiers = section(md(), '#### Review tier and dispatch');
    expect(tiers).toMatch(/\| `light` \|.*`compliance-bug`.*\|/);
    expect(tiers).toMatch(/\| `full` +\|.*`compliance`, `bug`, `security`, `architecture`.*\|/);
  });
  it('N4: the tier and backend come from harness review-tier; the rules are its description', () => {
    const tiers = section(md(), '#### Review tier and dispatch');
    expect(tiers).toMatch(/Run `harness review-tier` and use its output/);
    expect(tiers).toContain('`harness review-tier --moment standalone`');
    expect(tiers).toMatch(/`--pipeline-runner` when the `run_code_review` tool is callable/);
    expect(tiers).toMatch(
      /The rules in this section describe what the command computes and are the fallback when the CLI is unavailable/
    );
    expect(tiers).toMatch(
      /A session that cannot dispatch runs `light` whatever the command printed/
    );
    expect(section(md(), '## Harness Integration')).toContain('harness review-tier');
  });
  it('SC5: a session that cannot dispatch runs light, says so, and never records full', () => {
    const tiers = section(md(), '#### Review tier and dispatch');
    expect(tiers).toMatch(/\*\*Dispatched mode/);
    expect(tiers).toMatch(/no subagent-spawning tool/);
    expect(tiers).toMatch(
      /it cannot dispatch reviewers, so it runs a single-context `light` review/
    );
    expect(tiers).toMatch(/`tier: "light"`/);
    expect(tiers).toMatch(/Never record `full`/);
    expect(tiers).toMatch(/skips Review Acceptance/);
  });
  it('SC15: the pipeline backend falls back to agent and the receipt records agent', () => {
    const tiers = section(md(), '#### Review tier and dispatch');
    expect(tiers).toContain('`review.backend`');
    expect(tiers).toMatch(/record `backend: "agent"`/);
  });
});

describe('review receipt (SC1, SC3)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('sits between OUTPUT and Review Acceptance', () => {
    const text = md();
    expect(text.indexOf('### Phase 7: OUTPUT')).toBeLessThan(text.indexOf('### Review Receipt'));
    expect(text.indexOf('### Review Receipt')).toBeLessThan(text.indexOf('### Review Acceptance'));
  });
  it('names both artifact locations and stops writing the old shapes', () => {
    expect(receipt()).toContain('{sessionDir}/reviews/<moment>-<phase>/');
    expect(receipt()).toContain('.harness/reviews/<branch>-<head sha>/');
    expect(receipt()).toMatch(/phase-\{N\}-review\.json.*no longer written/s);
  });
  it('shows a findings file and a receipt that parse as JSON with the contract fields', () => {
    const blocks = [...receipt().matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]!));
    const file = blocks.find((b) => 'examinedFiles' in b);
    const r = blocks.find((b) => 'reviewers' in b);
    expect(file).toMatchObject({ schemaVersion: 1, reviewerId: expect.any(String) });
    expect(Object.keys(r).sort()).toEqual(
      [
        'advisory',
        'backend',
        'blocking',
        'coldContext',
        'computedTier',
        'diff',
        'moment',
        'priorFindingsSupplied',
        'reviewers',
        'schemaVersion',
        'tier',
        'tierReasons',
      ].sort()
    );
    expect(r.diff.base).toMatch(/^[0-9a-f]{40}$/);
    expect(r.diff.head).toMatch(/^[0-9a-f]{40}$/);
  });
  it('gates the receipt with the CLI or the MCP tool, under a gate marker', () => {
    expect(receipt()).toContain('harness check-review-receipt');
    expect(receipt()).toContain('check_review_receipt');
    expect(receipt()).toContain('<!-- pause: gate -->');
  });
  it('states each gate failure condition truthfully (SC2, SC4, SC16)', () => {
    const text = receipt();
    expect(text).toMatch(/exit 0 is a pass, exit 1 a failure/);
    const when = gateFailureRows(text);
    expect(when.get('RECEIPT_MISSING')).toMatch(/there is no receipt at the path/);
    expect(when.get('REQUIRED_REVIEWER_NOT_RUN')).toMatch(
      /a reviewer with `required: true` has `ran: false`/
    );
    expect(when.get('HEAD_MISMATCH')).toMatch(/`diff\.head` is not the current HEAD/);
    expect(when.get('FINAL_NOT_FULL')).toMatch(/`moment` is `final` and `tier` is not `full`/);
    expect(when.get('FINAL_NOT_COLD')).toMatch(/`moment` is `final` and `coldContext` is false/);
    expect(when.get('FINAL_PRIOR_FINDINGS')).toMatch(
      /`moment` is `final` and `priorFindingsSupplied` is true/
    );
    expect(when.get('EXAMINED_FILES_EMPTY')).toMatch(/an empty `examinedFiles`/);
    expect(when.get('EXAMINED_OUTSIDE_DIFF')).toMatch(/lists a file outside the diff/);
  });
  it('N6: defines the receipt counts as recounted from the findings files', () => {
    const text = receipt();
    expect(text).toMatch(
      /`blocking` and `advisory` are counted from the reviewer findings files as written, one per finding: every `critical` or `important` finding is blocking and every `suggestion` is advisory/
    );
    expect(text).toMatch(
      /Nothing is merged by file or line, so two findings at one location are two findings/
    );
    expect(md()).not.toMatch(/one per file and start line/);
    expect(text).not.toMatch(/`blocking` counts `critical` and `important` findings after Phase 6/);
    expect(text).toMatch(/The gate recounts both and fails on a mismatch \(`COUNTS_MISMATCH`/);
    expect(gateFailureRows(text).get('COUNTS_MISMATCH')).toMatch(
      /`blocking` or `advisory` differs from what the findings files hold/
    );
    expect(text).toMatch(/A finding Phase 5 discarded or downgraded stays in its reviewer's file/);
  });
  it('reads the MCP result by pass alone and states all three shapes of failures', () => {
    const text = receipt();
    expect(text).toMatch(/Decide on the tool result's `pass` field alone/);
    expect(text).toMatch(/`pass: true` is the only passing result/);
    expect(text).toMatch(
      /`failures` has three shapes: it is absent on a pass, a single object when there is exactly one failure, and a list when there are two or more/
    );
    expect(text).toMatch(/Never test `failures` to decide/);
    expect(text).not.toMatch(/`failures` arrives as a list or/);
    expect(text).toContain(
      'with `path` (the project root) and `receipt` (the review directory, which must be inside `path`)'
    );
  });
  it('a failing gate is never presented as a finished review', () => {
    const lines = receipt().split('\n');
    const marker = lines.findIndex((l) => l.includes('<!-- pause: gate -->'));
    expect(marker).toBeGreaterThan(0);
    const body = lines.slice(marker + 1, marker + 4).join('\n');
    expect(body).toMatch(/If the gate fails, the review is not complete/);
    expect(body).toMatch(/Never present a review as done on a failing or missing receipt/);
  });
  it('the pipeline backend still produces valid, attributed findings files', () => {
    const tiers = section(md(), '#### Review tier and dispatch');
    expect(tiers).toMatch(/reads every page of its findings/);
    expect(tiers).toMatch(/this session sets `findingClass` and `escapedFrom`/);
    expect(tiers).toMatch(
      /If the tool reports `stoppedByMechanical`, the mechanical checks failed: follow the Phase 2 exit rule \(no reviewer ran, no receipt is written\)/
    );
    expect(tiers).toMatch(/If it reports `skipped`, no reviewer ran: record each as `ran: false`/);
  });
  it('dispatched mode skips Review Acceptance', () => {
    expect(section(md(), '### Review Acceptance')).toMatch(
      /\*\*Dispatched mode skips this section\.\*\*/
    );
  });
});

describe('the gate in Harness Integration (SC8)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('states no rule that records anything before the gate passes', () => {
    const text = receipt();
    // The rule is stated once: no sentence says "only then" beside one that says "also on failure".
    expect(text).not.toMatch(/When the gate passes, and only then, run/);
  });
  it('lists the new commands and tool under Harness Integration', () => {
    const integration = section(md(), '## Harness Integration');
    expect(integration).toMatch(
      /counts that differ from the findings files, a base that is not an ancestor of the head \(or, for a final review, not the base `harness review-tier` prints\), and a stale head/
    );
    for (const name of ['harness check-review-receipt', 'check_review_receipt']) {
      expect(integration, name).toContain(name);
    }
  });
});

describe('review round 2: what the gate now checks (A1, A2, A10)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('A10: the failure table lists exactly the codes the gate can raise, in the code order', () => {
    expect([...gateFailureRows(receipt()).keys()]).toEqual([...REVIEW_GATE_FAILURE_CODES]);
    expect(receipt()).toMatch(/It prints a code for each failure\. These are all of them:/);
  });
  it('A1: a findings file carries the reviewed head, and a file without it or at another head fails', () => {
    const text = receipt();
    expect(text).toMatch(
      /`head` is the commit the reviewer read, as a resolved 40-character lowercase sha\. It is required, and it must equal the receipt's `diff\.head`/
    );
    expect(text).toMatch(
      /a file left from an earlier round fails the gate \(`FINDINGS_HEAD_MISMATCH`\)/
    );
    expect(gateFailureRows(text).get('FINDINGS_HEAD_MISMATCH')).toMatch(
      /a findings file's `head` is not the receipt's `diff\.head`/
    );
    expect(gateFailureRows(text).get('FINDINGS_FILE_INVALID')).toMatch(/no `head`/);
    const brief = section(md(), '#### Review tier and dispatch');
    expect(brief).toMatch(/the reviewed head as a resolved 40-character sha/);
    expect(brief).toMatch(/to set `head` in it to the reviewed head/);
    expect(brief).toMatch(/to start every finding id with its reviewer id/);
  });
  it('A2: the moment is checked against the review directory, or --moment', () => {
    const text = receipt();
    expect(text).toMatch(
      /the directory decides: a directory directly under `\.harness\/reviews\/` is a standalone review, a directory named `final-all` is the final review, and one named `phase-N` is a phase review/
    );
    expect(text).toContain('`--moment <phase|final|standalone>`');
    const when = gateFailureRows(text);
    expect(when.get('MOMENT_MISMATCH')).toMatch(
      /the receipt's `moment` is not the moment its directory states, or `--moment` contradicts the directory/
    );
    expect(when.get('MOMENT_UNKNOWN')).toMatch(
      /the directory states no moment and no `--moment` was given/
    );
  });
  it('A2: the light reviewer id is compliance-bug and the gate enforces it', () => {
    expect(receipt()).toMatch(/A `light` receipt requires exactly one reviewer, `compliance-bug`/);
    expect(gateFailureRows(receipt()).get('LIGHT_TIER_ROSTER')).toMatch(
      /requires anything other than the single reviewer `compliance-bug`/
    );
    expect(section(md(), '#### Review tier and dispatch')).toMatch(
      /`compliance-bug` is the only reviewer a `light` receipt may require; the gate enforces the id \(`LIGHT_TIER_ROSTER`\)/
    );
  });
  it('A5: a final base is the merge base, and every base is an ancestor of the head', () => {
    const text = receipt();
    expect(text).toMatch(/A `final` receipt's base must be the merge base with the default branch/);
    expect(text).not.toMatch(/unless it carries that `baseSource`/);
    expect(text).toMatch(/and the base is an ancestor of the head/);
    const when = gateFailureRows(text);
    expect(when.get('FINAL_BASE_NOT_MERGE_BASE')).toMatch(
      /`diff\.base` is not the merge base with the default branch, whatever `diff\.baseSource` says; or no default branch resolves and `diff\.baseSource` is not `starting-commit`/
    );
    expect(when.get('DIFF_BASE_NOT_ANCESTOR')).toMatch(/is not an ancestor of `diff\.head`/);
  });
  it('A9: hook files are never counted', () => {
    const text = receipt();
    expect(text).toMatch(
      /Files written by review hooks \(`hook-<name>\.json`\) are not reviewer findings files: they are never listed in `reviewers` and never counted in `blocking` or `advisory`/
    );
  });
  it('says what the gate still does not check', () => {
    // Round 4: the final base is only as trustworthy as the clone's remote-tracking refs.
    expect(receipt()).toMatch(
      /The merge base of a final review comes from the clone's local remote-tracking refs, which the session itself can rewrite/
    );
  });
  it('the older artifact shapes have no reader in this skill or in code', () => {
    expect(receipt()).toMatch(
      /are no longer written, and nothing in this skill or in code reads them; harness-autopilot reads them in one FINAL_REVIEW step/
    );
    expect(receipt()).not.toMatch(/are read for back-compatibility/);
  });
});

describe('review round 2: who owns the receipt, and the gate stop (A7, A8, A10)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  const tiers = () => section(md(), '#### Review tier and dispatch');
  it('A7: a run given a review-dir writes only its findings file; the dispatcher does the rest', () => {
    const args = section(md(), '## Argument Resolution');
    expect(args).toMatch(
      /you are a dispatched reviewer\. That is the one test for dispatched mode/
    );
    expect(args).toMatch(/Write only your findings file there/);
    expect(receipt()).toMatch(
      /A dispatched reviewer \(its brief names a `review-dir`\) writes its findings file, as the next two paragraphs describe, and nothing else in this section is its job/
    );
  });
  it('A7: one rule decides dispatched mode, and it names who runs MECHANICAL', () => {
    const text = tiers();
    expect(text).toMatch(
      /You are in dispatched mode when, and only when, your brief names a `review-dir`\. Decide it once, at skill start, by that test alone/
    );
    // One test only: the tool list no longer decides dispatched mode.
    expect(text).not.toMatch(/otherwise your tool list does/);
    expect(text).not.toMatch(/or when your own tool list has no subagent-spawning tool/);
    expect(md()).not.toMatch(/from your tool list alone/);
    expect(md()).not.toMatch(/Autopilot states the tier for the reviews it drives/);
    expect(text).toMatch(
      /you are the whole review\. Run Phase 2 \(MECHANICAL\) and Phase 3 \(CONTEXT\) yourself/
    );
    expect(text).toMatch(
      /the session that dispatched it ran MECHANICAL, CONTEXT and CALIBRATE DEPTH and writes the receipt/
    );
  });
  it('A8: the tier reads every commit message of the range, trailers excluded, from the top level', () => {
    const text = tiers();
    expect(text).toMatch(
      /its diff, a changed path or any commit message of its range matches a risk keyword/
    );
    expect(text).toMatch(/only identity trailers are left out of the match/);
    expect(text).toMatch(
      /The command runs git from the repository top level, so it prints the same answer from any directory of the repository/
    );
    expect(md()).not.toMatch(/latest commit message/);
  });
  it('A10: a failed gate stops and waits; nothing is repaired before the human answers', () => {
    const lines = receipt().split('\n');
    const marker = lines.findIndex((l) => l.includes('<!-- pause: gate -->'));
    const body = lines[marker + 1] ?? '';
    expect(body).toMatch(
      /Stop here: report each failure with its code and the reviewer it names, and ask "re-run \/ stop\."/
    );
    expect(body).toMatch(
      /Until the human answers, change nothing: do not dispatch a reviewer, rewrite the receipt or run the gate again/
    );
    expect(body).toMatch(
      /No repair may change `tier`, `moment`, a reviewer's `required`, `coldContext`, `priorFindingsSupplied` or the diff range to make a failing receipt pass/
    );
    expect(receipt()).not.toMatch(/Fix what you can/);
  });
});

describe('review round 2: skill.yaml says what the skill writes (A11)', () => {
  const yaml = () => readFileSync(resolve(SKILL_DIR, 'skill.yaml'), 'utf-8');
  it('declares Write in both tool lists, and the dispatch arguments', () => {
    const text = yaml();
    expect(text.match(/^ {2,4}- Write$/gm)).toHaveLength(2);
    for (const arg of ['review-dir', 'moment', 'head']) {
      expect(text, arg).toContain(`    - name: ${arg}\n`);
    }
  });
  it('lists the review files it writes and stays non-persistent', () => {
    const text = yaml();
    expect(text).toMatch(/^ {2}persistent: false$/m);
    expect(text).toContain('    - .harness/reviews/*/*.json');
    expect(text).toContain('    - .harness/sessions/*/reviews/*/*.json');
    expect(text).not.toMatch(/^ {2}files: \[\]$/m);
  });
});

describe('review round 3: moment, base, phases and the mechanical exit (A1, A2, A3, A5)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('A1: --moment is read only for a directory that states no moment, and a disagreement fails', () => {
    const text = receipt();
    expect(text).toMatch(
      /is read only for a receipt in a directory that states none of these, such as a copy made elsewhere/
    );
    expect(text).toMatch(
      /the flag changes nothing when it agrees and fails the gate when it disagrees \(`MOMENT_MISMATCH`: `the receipt directory is the final review, but --moment says phase; the directory decides`\), whatever the receipt itself says/
    );
    expect(md()).not.toMatch(/states it instead/);
    expect(md()).not.toMatch(/`--moment`[^.\n]*\b(?:overrides|wins)\b/);
    expect(gateFailureRows(text).get('GATE_ERROR')).toMatch(
      /`moment` is not one of the three values/
    );
    expect(text).toMatch(
      /a `--moment` value outside `phase`, `final` and `standalone` is refused by the argument parser, exit 1, before the gate runs/
    );
  });
  it('A2: the N of a review directory is the 0-based phase position a decision record carries', () => {
    expect(section(md(), '## Argument Resolution')).toMatch(
      /where `\{N\}` is the phase's 0-based position, so `phase-0` for the first phase/
    );
    // Every literal review directory in the skill is 0-based: none is numbered without a phase-0.
    const literals = [...md().matchAll(/\bphase-(\d+)\b/g)].map((m) => Number(m[1]));
    expect(literals.length).toBeGreaterThan(0);
    expect(Math.min(...literals)).toBe(0);
    expect(new Set(literals)).toEqual(new Set([0]));
  });
  it('A3: baseSource starting-commit is accepted only when no merge base resolves', () => {
    const text = receipt();
    expect(text).toMatch(
      /take it, and `baseSource`, from `harness review-tier --moment final --session <slug>`, which uses the gate's resolver/
    );
    expect(text).toMatch(
      /Add `"baseSource": "starting-commit"` to `diff` only when that command printed it: no default-branch merge base resolves and the base is the session's starting commit/
    );
    expect(text).toMatch(
      /when a merge base resolves, the base must be that commit whatever `baseSource` says; when none resolves, the base must be the `startingCommit` of the session's `autopilot-state\.json`, and a receipt outside a session review directory, or a session that records no full `startingCommit`, fails `STARTING_COMMIT_UNKNOWN`/
    );
    // Round 4: no skill carries a hand-run recipe for the base.
    expect(md()).not.toMatch(/symbolic-ref/);
  });
  it('A5: a failed mechanical phase writes no receipt, and a dispatched reviewer reports it', () => {
    const text = section(md(), '### Phase 2: MECHANICAL');
    expect(text).toMatch(
      /A review that ends here dispatched no reviewer and writes no receipt, so there is nothing to gate and nothing to record/
    );
    expect(text).toMatch(
      /In dispatched mode, write no findings file and return a report whose first line is `MECHANICAL FAILED`, followed by each failing check with its output/
    );
    expect(text).toMatch(
      /treats that as a red check to fix, not as a reviewer that did not run and not as a failed receipt gate/
    );
  });
  it('the unreadable-file rules of the gate are stated: regular files of at most 5 MB', () => {
    const when = gateFailureRows(receipt());
    expect(when.get('RECEIPT_INVALID')).toMatch(
      /`not a regular file`, `too large` for a file over 5 MB/
    );
    expect(when.get('FINDINGS_FILE_MISSING')).toMatch(
      /is not a regular file of at most 5 MB inside the receipt directory/
    );
    expect(when.get('FINDINGS_PATH_INVALID')).toMatch(
      /is not a relative path that stays inside the receipt directory/
    );
  });
});

describe('review round 3: craft, dispatched mode and the reviewer self-check (A6, A7)', () => {
  const tiers = () => section(md(), '#### Review tier and dispatch');
  const receipt = () => section(md(), '### Review Receipt');
  it('A6: craft is not resolved at after:mechanical under a dispatching host', () => {
    const text = section(md(), '#### Lifecycle skill hooks — `after:mechanical`');
    expect(text).toMatch(/\*\*Only a run that owns its review resolves craft here\.\*\*/);
    expect(text).toMatch(/do NOT resolve craft at `after:mechanical`/);
    expect(text).toMatch(/writes their output to `hook-<name>\.json` in the review directory/);
    expect(text).toMatch(/Only the craft auto-wiring moves to the host/);
    // Round 2, fix 3: the configured hooks are the orchestrating session's, never the reviewer's.
    expect(text).toMatch(
      /run by the session that\s+orchestrates the review: a dispatched reviewer cannot dispatch, so in dispatched mode you run\s+none of them/
    );
  });
  it('A7: one test decides dispatched mode, and the two dispatched reviewers are told apart', () => {
    const text = tiers();
    expect(text.match(/You are in dispatched mode when/g)).toHaveLength(1);
    expect(text).toMatch(
      /- \*\*The dispatched `light` reviewer\*\* \(the brief says tier `light`, reviewer id `compliance-bug`\): you are the whole review/
    );
    expect(text).toMatch(
      /- \*\*A per-domain reviewer of a `full` review\*\* \(the brief names one of `compliance`, `bug`, `security`, `architecture`, `adversarial`, `typescript-strict`, `frontend-races`\): you are one reviewer of several\. Run no mechanical check, no context phase and no calibration/
    );
    expect(text).toMatch(
      /- \*\*A session that cannot fan out\.\*\* A run whose brief names no `review-dir` owns its review/
    );
    expect(text).toMatch(
      /This is not dispatched mode: Review Acceptance still applies to a standalone run/
    );
  });
  it('A7, round 4: every reviewer brief carries the CLI self-check, and the section gives the command', () => {
    expect(tiers()).toMatch(
      /and to run `harness check-review-receipt --findings <file> --base <base> --head <head>` on the file before returning and correct what it reports \(Reviewer findings files\)/
    );
    expect(tiers()).toMatch(
      /to list in `examinedFiles` only files that `git diff --name-only --no-renames -z <base>\.\.<head>` prints/
    );
    const text = receipt();
    expect(text).toMatch(/\*\*Self-check \(every reviewer, before returning\)\.\*\*/);
    expect(text).toContain(
      '```bash\nharness check-review-receipt --findings <review directory>/<reviewerId>.json --base <base sha> --head <head sha>\n```'
    );
    expect(text).toMatch(
      /It prints `findings file check: PASS: <path>` \(exit 0\), or `findings file check: FAIL: <path>` and one `- \[CODE\] message` line per failure \(exit 1\)/
    );
    expect(text).toMatch(/never report the check as passed when it did not run/);
    expect(text).toMatch(
      /List in `examinedFiles` only files that `git diff --name-only --no-renames -z <base>\.\.<head>` prints/
    );
    // The node -e parser probe and its fallback are gone (round 4, fix 9).
    expect(md()).not.toMatch(/node -e/);
    expect(md()).not.toMatch(/parser unavailable/);
    expect(md()).not.toMatch(/name-only <base>/);
  });
  it('A7, round 4: the flags the skill names are the flags the CLI defines', () => {
    const cli = readFileSync(
      resolve(
        SKILL_DIR,
        '..',
        '..',
        '..',
        '..',
        'packages/cli/src/commands/check-review-receipt.ts'
      ),
      'utf-8'
    );
    for (const flag of ['--findings <file>', '--base <sha>', '--head <sha>']) {
      expect(cli, flag).toContain(`'${flag}'`);
    }
  });
  it('A7, round 4: the self-check codes the skill lists are exactly what the self-check can raise', () => {
    const text = receipt();
    const sentence =
      /The codes it can print are the gate's: ([^\n]*?)\. It needs only/.exec(text)?.[1] ?? '';
    const named = [...sentence.matchAll(/`([A-Z_]+)`/g)].map((m) => m[1]);
    const example =
      /```json\n(\{\s*"schemaVersion": 1,\s*"reviewerId"[\s\S]*?)```/.exec(text)?.[1] ?? '';
    const file = JSON.parse(example) as Record<string, unknown> & {
      head: string;
      examinedFiles: string[];
    };
    const finding = {
      id: 'bug-x',
      file: file.examinedFiles[0],
      lineRange: [1, 1],
      severity: 'suggestion',
      title: 'x',
    };
    const range = {
      ranged: true,
      head: file.head,
      diffFiles: file.examinedFiles,
      worktreeClean: true,
    } as const;
    // The example passes; each listed code is produced by one input.
    expect(checkReviewerFindingsText(example, 'bug.json', range)).toEqual([]);
    const raised = new Set<string>();
    const add = (text: string | undefined, r: Parameters<typeof checkReviewerFindingsText>[2]) =>
      checkReviewerFindingsText(text, 'bug.json', r).forEach((f) => raised.add(f.code));
    add(undefined, { ranged: false });
    add('{', { ranged: false });
    add(JSON.stringify({ ...file, examinedFiles: [] }), { ranged: false });
    add(JSON.stringify({ ...file, findings: [finding, finding] }), { ranged: false });
    add(example, { ranged: true, head: file.head, diffFiles: undefined, worktreeClean: true });
    add(example, { ranged: true, head: file.head, diffFiles: [], worktreeClean: true });
    add(example, {
      ranged: true,
      head: '1'.repeat(40),
      diffFiles: file.examinedFiles,
      worktreeClean: true,
    });
    add(example, { ...range, worktreeClean: false });
    add(JSON.stringify({ ...file, reviewerId: 'not-a-reviewer' }), { ranged: false });
    add(example, { ranged: true, head: file.head, diffFiles: ['other.ts'], worktreeClean: true });
    expect([...raised].sort()).toEqual([...named].sort());
    expect(named).toHaveLength(10);
  });
});

describe('review round 3: the tier (A10)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  const tiers = () => section(md(), '#### Review tier and dispatch');
  it('A10: content is read as text, identity trailers only are excluded, light is the agent backend', () => {
    const text = tiers();
    expect(text).toMatch(
      /The diff's content is read as text whatever git attributes say: a file marked `-diff` or `binary` in a `\.gitattributes` file or in `\.git\/info\/attributes` is still matched/
    );
    expect(text).toMatch(
      /a trailer is an identity trailer when its key ends in `-by` \(any such key\), or is `Cc`, `Change-Id` or `Claude-Session`, compared without regard to case/
    );
    expect(text).toMatch(/Every other trailer is matched like the rest of the message/);
    expect(text).toMatch(
      /A `light` review always resolves to the agent backend, whatever the key says: the rule is in core \(`resolveReviewBackend`\)/
    );
    expect(md()).not.toMatch(/the `Key: value` lines of the last paragraph/);
  });
});

describe('review round 3: skill.yaml files say what the skills write and accept (A11)', () => {
  const SKILLS = resolve(SKILL_DIR, '..', '..');
  type Arg = { name: string; description: string };
  type SkillYaml = {
    cli: { args: Arg[] };
    phases?: Array<{ name: string; description: string }>;
    state: { persistent: boolean; files?: string[] };
  };
  const yamlOf = (platform: string, skill: string) =>
    readFileSync(resolve(SKILLS, platform, skill, 'skill.yaml'), 'utf-8');
  const load = (platform: string, skill: string) => parseYaml(yamlOf(platform, skill)) as SkillYaml;
  it('harness-autopilot lists the review artifacts it writes', () => {
    const files = load('claude-code', 'harness-autopilot').state.files ?? [];
    expect(files).toContain('.harness/sessions/*/reviews/*/*.json');
    const yaml = readFileSync(resolve(SKILL_DIR, '..', 'harness-autopilot', 'skill.yaml'), 'utf-8');
    expect(yaml).not.toMatch(/so it stays last/);
  });
  it('harness-autopilot describes the final review as the cold, full review', () => {
    const phase = load('claude-code', 'harness-autopilot').phases?.find(
      (p) => p.name === 'final_review'
    );
    expect(phase?.description).toMatch(
      /^Cold, full review of the whole change from the merge base \(one dispatch per reviewer, no prior findings, a gated receipt\); any later commit returns here$/
    );
    expect(phase?.description).not.toMatch(/Project-wide code review of cumulative changes/);
  });
  it('harness-code-review declares the reviewer id a dispatched brief names', () => {
    const args = load('claude-code', 'harness-code-review').cli.args;
    expect(args.map((a) => a.name)).toEqual(
      expect.arrayContaining(['review-dir', 'moment', 'reviewer', 'head'])
    );
    const reviewer = args.find((a) => a.name === 'reviewer')?.description ?? '';
    for (const id of ['compliance-bug', 'adversarial', 'typescript-strict', 'frontend-races']) {
      expect(reviewer, id).toContain(id);
    }
  });
  it('no description in the two files holds an angle bracket (it would reach generated docs)', () => {
    for (const skill of ['harness-autopilot', 'harness-code-review']) {
      const y = load('claude-code', skill);
      const texts = [...y.cli.args, ...(y.phases ?? [])].map((x) => x.description);
      for (const t of texts) expect(t, `${skill}: ${t}`).not.toMatch(/[<>]/);
    }
  });
});

describe("round 4: the identity-trailer rule is stated once, and it is the code's rule", () => {
  const REPO = resolve(SKILL_DIR, '..', '..', '..', '..');
  const ruleSentence = () =>
    /a trailer is an identity trailer when ([^.]*)\./.exec(
      section(md(), '#### Review tier and dispatch')
    )?.[1] ?? '';
  it('the keys the skill names are the alternatives of IDENTITY_TRAILER in tier-selector.ts', () => {
    const code = readFileSync(resolve(REPO, 'packages/core/src/review/tier-selector.ts'), 'utf-8');
    const pattern = /const IDENTITY_TRAILER = \/\^\(\?:([^)]*)\):\/i;/.exec(code)?.[1];
    expect(pattern).toBeDefined();
    const alternatives = (pattern ?? '').split('|');
    const literal = alternatives.filter((a) => /^[a-z-]+$/.test(a));
    const suffix = alternatives.filter((a) => !/^[a-z-]+$/.test(a));
    expect(suffix).toEqual(['[A-Za-z0-9-]+-by']);
    const named = [...ruleSentence().matchAll(/`([^`]+)`/g)].map((m) => m[1]!.toLowerCase());
    expect(named).toEqual(['-by', ...literal]);
    expect(ruleSentence()).toMatch(/compared without regard to case/);
  });
  it('the rule behaves as the skill says: identity trailers never force full, other trailers do', () => {
    const phase = (message: string, trailers: string[]) =>
      selectReviewTier({
        moment: 'phase',
        changedFiles: ['docs/a.md'],
        diffText: '',
        commitMessages: [message],
        commitTrailers: [trailers],
      }).tier;
    expect(phase('docs\n\nClaude-Session: token', ['Claude-Session: token'])).toBe('light');
    expect(phase('docs\n\nAcked-by: token', ['Acked-by: token'])).toBe('light');
    expect(
      phase('docs\n\nSecurity: the token check now runs first', [
        'Security: the token check now runs first',
      ])
    ).toBe('full');
  });
  it('no other skill, nor the changeset, restates the key list', () => {
    const autopilot = readFileSync(
      resolve(SKILL_DIR, '..', 'harness-autopilot', 'SKILL.md'),
      'utf-8'
    );
    const changeset = readFileSync(
      resolve(REPO, '.changeset/review-fidelity-receipts.md'),
      'utf-8'
    );
    for (const [name, text] of [
      ['harness-autopilot', autopilot],
      ['changeset', changeset],
    ] as const) {
      expect(text, name).not.toMatch(/Change-Id/);
      expect(text, name).not.toMatch(/Reviewed-by|Acked-by|Co-Authored-By/);
    }
    expect(autopilot).toMatch(
      /The command decides which commit-message trailers are left out of the match: identity trailers only, as harness-code-review "Review tier and dispatch" states the rule/
    );
    expect(md().match(/a trailer is an identity trailer when/g)).toHaveLength(1);
  });
});

describe('round 4: code-review instructions of review round 4 are each pinned', () => {
  const receipt = () => section(md(), '### Review Receipt');
  const tiers = () => section(md(), '#### Review tier and dispatch');
  it('review-tier prints the base, reads the backend from the top, and a huge diff is full', () => {
    const text = tiers();
    expect(text).toMatch(
      /`review\.backend` is read from the `harness\.config\.json` at that top level too/
    );
    expect(text).toMatch(
      /A diff too large for git's output buffer gives `full` with the reason `diff-too-large`, never `light`/
    );
    expect(text).toMatch(
      /For a final review it also prints the base the receipt gate will demand, from the gate's own resolver/
    );
    // Unit 1 fix round 1, fix 7: a standalone review takes its base from its range; --session is final-only.
    expect(text).toMatch(
      /A standalone review takes its `diff\.base` from the range it reviews: a `commit-range` argument names that range, and its first commit is the base\./
    );
    expect(text).toMatch(
      /when none resolves it prints `Review base: unresolved \(no default-branch merge base: name the range to review explicitly …\)`: then pass the range as a `commit-range` argument/
    );
    expect(text).toMatch(
      /`--session` applies to `--moment final` only and is an error with any other moment, as `--base` is with any moment but `phase`\./
    );
    // Fix 8: a stacked branch names its target, and the gate is given the same one.
    expect(text).toMatch(
      /`--target <ref>` names the remote-tracking branch the reviewed branch merges into when that is not the default branch \(a stacked PR's base, such as `origin\/feat\/parent`\): the base is then the merge base with that ref\. Only a ref under `refs\/remotes\/` is accepted; a sha, a HEAD-relative name, a local branch or a tag gives `Review base: unresolved`\. The command prints the full ref \(`target` in JSON\), and a final receipt records it as `diff\.target`, which the gate reads\./
    );
    expect(text).toMatch(
      /`review\.backend` in the repository top's `harness\.config\.json` \(or the file the global `-c` option names\) is `"agent"` \(the default\) or `"pipeline"`; any other value is an error \(exit 1\)/
    );
  });
  it('reviewer ids are known ids', () => {
    const text = receipt();
    expect(text).toMatch(
      /- Every reviewer `id` is a known reviewer: `compliance`, `bug`, `security`, `architecture`, `adversarial`, `typescript-strict`, `frontend-races` or `compliance-bug`\. Any other id fails `UNKNOWN_REVIEWER`/
    );
  });
  it('the failure table states the round-4 conditions', () => {
    const rows = gateFailureRows(receipt());
    expect(rows.get('STARTING_COMMIT_UNKNOWN')).toMatch(
      /no default branch resolves, `diff\.baseSource` is `starting-commit`, and the session's starting commit is unknown/
    );
    expect(rows.get('FINAL_BASE_NOT_MERGE_BASE')).toMatch(
      /or no default branch resolves, `diff\.baseSource` is `starting-commit` and `diff\.base` is not the session's starting commit/
    );
    expect(rows.get('UNKNOWN_REVIEWER')).toMatch(/whether or not it is required or ran/);
  });
});

describe('unit 1 fix round 1: code-review instructions, each pinned', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('fix 9: a directory inside a session is read by the session rule before the standalone one', () => {
    expect(receipt()).toMatch(
      /the gate reads any directory directly under `\.harness\/reviews\/` as a standalone review, except one inside a session \(`sessions\/<slug>\/reviews\/<label>`\), which it reads by the session rule first\. A session slug that starts with a dot is refused\./
    );
  });
});

describe('unit 1 fix round 1: the self-check reviewer id and mode flags (fix 11)', () => {
  const receipt = () => section(md(), '### Review Receipt');
  it('the self-check prints UNKNOWN_REVIEWER for an id the gate would reject', () => {
    expect(receipt()).toMatch(
      /`UNKNOWN_REVIEWER` \(a `reviewerId` that is not a known reviewer, which the gate would reject\)/
    );
  });
  it('a flag the mode does not read is an error', () => {
    expect(receipt()).toMatch(
      /A flag the mode does not read is an error, never ignored: `--moment` with `--findings` exits 1, and so do `--base` or `--head` with a receipt path\./
    );
  });
});

describe('unit 1 fix round 1: identity trailers are compared by key and value (fix 12)', () => {
  it('states that spacing git normalises does not keep an identity trailer in the match', () => {
    expect(section(md(), '#### Review tier and dispatch')).toMatch(
      /A trailer of the message is matched to git's by its key and value as git parses them, not by its line text, so a trailer whose spacing git normalises \(`Signed-off-by :  A` prints as `Signed-off-by: A`\) is still left out\./
    );
  });
});

describe('unit 1 fix round 1: a review is bound to a clean tracked tree (fix 5)', () => {
  it('code-review says to commit or discard before the review', () => {
    expect(section(md(), '### Review Receipt')).toMatch(
      /commit or discard every change to a tracked file before the review starts \(`git status --porcelain --untracked-files=no` prints nothing\); the gate fails `WORKTREE_DIRTY` otherwise\./
    );
  });
});

describe('unit 1 fix round 1: the phase base is recomputed (fix 1)', () => {
  it('the receipt rules say the gate recomputes a phase base and only checks a standalone one for ancestry', () => {
    expect(section(md(), '### Review Receipt')).toMatch(
      /A `phase` receipt's base is the one harness-autopilot REVIEW step 1 prescribes, and the gate recomputes it from the session's earlier receipts and `startingCommit` \(`PHASE_BASE_MISMATCH`, `PHASE_BASE_UNKNOWN`\)\. A `standalone` receipt's base is only checked to be an ancestor of the head\./
    );
  });
});

describe('unit 1 fix round 1: a demotion to light is visible (fix 3)', () => {
  it('a session that cannot fan out records the computed tier and the demotion', () => {
    expect(section(md(), '#### Review tier and dispatch')).toMatch(
      /when that was `full` it also records `demotion: "no-subagent-tool"` and says in its output that the review ran below its computed tier\. A `light` receipt whose `computedTier` is `full` and that carries no demotion fails `TIER_DEMOTED`\./
    );
  });
  it('the receipt fields say when a demotion is valid', () => {
    expect(section(md(), '### Review Receipt')).toMatch(
      /`demotion` is set only when `tier` is `light` and `computedTier` is `full`, and its one value is `no-subagent-tool`/
    );
  });
});

describe('unit 1 fix round 1: no later-unit promise, the pipeline files, cold honesty (fixes 4, 13)', () => {
  const tiers = () => section(md(), '#### Review tier and dispatch');
  it('fix 13: dispatched mode and the single-context run promise no attribution step', () => {
    expect(tiers()).toMatch(/writes no receipt, runs no gate and skips Review Acceptance;/);
    expect(tiers()).toMatch(
      /then its own receipt \(`tier: "light"`, that single reviewer\) and gate\./
    );
    expect(md()).not.toMatch(/records no attribution|gate and attribution/);
  });
  it('fix 13: the pipeline backend writes a findings file for every required reviewer', () => {
    expect(tiers()).toMatch(
      /Every required reviewer gets a file, with `"findings": \[\]` when its domain returned nothing: a required reviewer without one is `ran: false`, and the gate fails\./
    );
  });
  it('fix 4: a review run again after a fix in one context is not cold', () => {
    expect(tiers()).toMatch(
      /A review it runs again after a fix is in a context that has seen the earlier findings, so that receipt records `coldContext: false` and `priorFindingsSupplied: true`\./
    );
  });
});

describe('unit 1 fix round 1: the prose reviewer list is the contract list', () => {
  it('names exactly the full-tier, conditional and light reviewer ids of the types package', async () => {
    const types = await import('@harness-engineering/core');
    const listed = /- Every reviewer `id` is a known reviewer: ([^.]*)\./.exec(
      section(md(), '### Review Receipt')
    )?.[1];
    const named = [...(listed ?? '').matchAll(/`([a-z-]+)`/g)].map((m) => m[1]);
    expect(named.sort()).toEqual(
      [
        ...types.FULL_TIER_REVIEWER_IDS,
        ...types.CONDITIONAL_REVIEWER_IDS,
        types.LIGHT_TIER_REVIEWER_ID,
      ].sort()
    );
  });
});
