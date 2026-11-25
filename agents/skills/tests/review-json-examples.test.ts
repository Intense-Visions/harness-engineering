// agents/skills/tests/review-json-examples.test.ts
//
// Shift-left pipeline fidelity, Phase 1: every JSON example in the two skills' receipt, findings
// and decision sections is parsed by the parsers the gate and the stamp use. An example that
// drifts from the schema fails here, not in an agent's review.

import { describe, it, expect } from 'vitest';
import {
  AutopilotSessionStateSchema,
  REVIEW_DECIDERS,
  REVIEW_DECISION_KINDS,
  ReviewDecisionRecordSchema,
  parseReviewReceipt,
  parseReviewerFindingsFile,
  readSessionReviewState,
} from '@harness-engineering/core';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'claude-code');
const read = (skill: string) => readFileSync(resolve(SKILLS, skill, 'SKILL.md'), 'utf-8');
const autopilot = () => read('harness-autopilot');
const codeReview = () => read('harness-code-review');

/** The text from a heading to the next heading of the same or higher level. */
function section(text: string, heading: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start < 0) throw new Error(`heading not found: ${heading}`);
  const level = (/^#+/.exec(heading) ?? [''])[0].length;
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && (/^#+/.exec(l) ?? [''])[0].length <= level
  );
  return lines.slice(start, end < 0 ? undefined : end).join('\n');
}

type Example = { where: string; value: Record<string, unknown> };

function jsonBlocks(where: string, text: string): Example[] {
  return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => ({
    where,
    value: JSON.parse(m[1] ?? '') as Record<string, unknown>,
  }));
}

const examples = (): Example[] => [
  ...jsonBlocks('harness-code-review, Review Receipt', section(codeReview(), '### Review Receipt')),
  ...jsonBlocks('harness-autopilot, Review records', section(autopilot(), '### Review records')),
];

const isReceipt = (e: Example) => 'reviewers' in e.value;
const isFindingsFile = (e: Example) => 'examinedFiles' in e.value;
const isDecision = (e: Example) => 'kind' in e.value && 'state' in e.value;

describe('JSON examples in the review sections parse with the code that reads them', () => {
  it('every example is a receipt, a findings file or a decision record (none is unclassified)', () => {
    const all = examples();
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (const e of all) {
      const kinds = [isReceipt(e), isFindingsFile(e), isDecision(e)].filter(Boolean);
      expect(kinds, `${e.where}: ${JSON.stringify(e.value).slice(0, 80)}`).toHaveLength(1);
    }
  });
  it('every receipt example passes parseReviewReceipt', () => {
    const receipts = examples().filter(isReceipt);
    expect(receipts.length).toBeGreaterThanOrEqual(1);
    for (const e of receipts) {
      const parsed = parseReviewReceipt(e.value);
      expect(parsed.ok ? '' : parsed.error.message, e.where).toBe('');
    }
  });
  it('every findings-file example passes parseReviewerFindingsFile, and so carries head', () => {
    const files = examples().filter(isFindingsFile);
    expect(files.length).toBeGreaterThanOrEqual(1);
    for (const e of files) {
      const parsed = parseReviewerFindingsFile(e.value);
      expect(parsed.ok ? '' : parsed.error.message, e.where).toBe('');
      expect(e.value.head).toMatch(/^[0-9a-f]{40}$/);
    }
    // Control: the same example without head is refused, so the parser is the one that checks it.
    const { head: _head, ...withoutHead } = files[0]!.value;
    expect(parseReviewerFindingsFile(withoutHead).ok).toBe(false);
  });
  it('the findings-file example is for the head of the receipt example beside it', () => {
    const inSkill = jsonBlocks('code-review', section(codeReview(), '### Review Receipt'));
    const receipt = inSkill.find(isReceipt)?.value as { diff: { head: string } };
    const file = inSkill.find(isFindingsFile)?.value as { head: string };
    expect(file.head).toBe(receipt.diff.head);
  });
  it('there is one decision example per kind and each passes the record schema', () => {
    const decisions = examples().filter(isDecision);
    expect(decisions.map((e) => e.value.kind).sort()).toEqual([...REVIEW_DECISION_KINDS].sort());
    for (const e of decisions) {
      const parsed = ReviewDecisionRecordSchema.safeParse(e.value);
      expect(parsed.success ? '' : parsed.error.message, e.where).toBe('');
    }
  });
  it('the stamp reader reads all of them from a decisions[] and keys them by review', () => {
    const decisions = examples()
      .filter(isDecision)
      .map((e) => e.value);
    const state = readSessionReviewState(JSON.stringify({ decisions }));
    expect(state.decisionsReadable).toBe(true);
    const read = [...state.decisions.values()].flat();
    expect(read).toHaveLength(decisions.length);
    for (const label of state.decisions.keys()) expect(label).toMatch(/^(?:phase-\d+|final-all)$/);
    // Control: the shape earlier versions of the skill wrote is reported as unreadable.
    const old = { state: 'REVIEW', phase: 0, chosen: 'override', question: 'x' };
    expect(readSessionReviewState(JSON.stringify({ decisions: [old] })).decisionsReadable).toBe(
      false
    );
  });
});

describe('the session-state example in INIT is the shape the stamp reads', () => {
  const stateExamples = () =>
    jsonBlocks('harness-autopilot, INIT', section(autopilot(), '### INIT'));
  type Phase = { index: number; name: string; status: string; planPath: string | null };
  it('INIT gives exactly one example and it passes AutopilotSessionStateSchema', () => {
    const all = stateExamples();
    expect(all).toHaveLength(1);
    const parsed = AutopilotSessionStateSchema.safeParse(all[0]!.value);
    expect(parsed.success ? '' : parsed.error.message).toBe('');
    expect(all[0]!.value.startingCommit).toMatch(/^[0-9a-f]{40}$/);
  });
  it('every phases[] entry carries index, name, complexity, status and planPath, index from 0', () => {
    const phases = stateExamples()[0]!.value.phases as Phase[];
    expect(phases.length).toBeGreaterThanOrEqual(2);
    phases.forEach((p, i) => {
      expect(Object.keys(p).sort()).toEqual(['complexity', 'index', 'name', 'planPath', 'status']);
      expect(p.index).toBe(i);
    });
  });
  it('the stamp reader takes phase-0 .. phase-(n-1) then final-all from it, with nothing unknown', () => {
    const value = stateExamples()[0]!.value;
    const state = readSessionReviewState(JSON.stringify(value));
    const n = (value.phases as Phase[]).length;
    expect(state.expected).toEqual([
      ...Array.from({ length: n }, (_, i) => `phase-${i}`),
      'final-all',
    ]);
    expect(state.expectedUnknown).toBeUndefined();
    expect(state.startingCommit).toBe(value.startingCommit);
    // Control: the same example numbered from 1 makes the expected set unknown, as the skill says.
    const oneBased = {
      ...value,
      phases: (value.phases as Phase[]).map((p) => ({ ...p, index: p.index + 1 })),
    };
    const wrong = readSessionReviewState(JSON.stringify(oneBased));
    expect(wrong.expected).toBeUndefined();
    expect(wrong.expectedUnknown).toEqual({ reason: 'phase-index', position: 0 });
  });
  it('every decision example carries a round, and names a phase of the session example', () => {
    const phases = (stateExamples()[0]!.value.phases as Phase[]).map((p) => p.index);
    const decisions = examples().filter(isDecision);
    expect(decisions).toHaveLength(3);
    for (const d of decisions) {
      expect(d.value.round, JSON.stringify(d.value)).toEqual(expect.any(Number));
      if (d.value.state === 'REVIEW') expect(phases).toContain(d.value.phase);
      else expect(d.value.phase).toBeUndefined();
    }
    // With the session example's phase list, none of them is an orphan.
    const state = readSessionReviewState(
      JSON.stringify({ ...stateExamples()[0]!.value, decisions: decisions.map((d) => d.value) })
    );
    expect(state.decisionsReadable).toBe(true);
    expect(state.orphans).toEqual([]);
    for (const label of state.decisions.keys()) expect(state.expected).toContain(label);
  });
  it('round 4: every decision example carries decidedBy, and the skill writes only human or audited', () => {
    const decisions = examples().filter(isDecision);
    expect(decisions).toHaveLength(3);
    for (const d of decisions) {
      expect(REVIEW_DECIDERS, JSON.stringify(d.value)).toContain(d.value.decidedBy);
      expect(['human', 'audited']).toContain(d.value.decidedBy);
      // Control: without decidedBy, or with another value, the record schema refuses it.
      const { decidedBy: _by, ...without } = d.value;
      expect(ReviewDecisionRecordSchema.safeParse(without).success).toBe(false);
      expect(
        ReviewDecisionRecordSchema.safeParse({ ...d.value, decidedBy: 'unknown' }).success
      ).toBe(false);
    }
    // The stamp reader reads them with their decider; a record without one is legacy.
    const state = readSessionReviewState(
      JSON.stringify({ decisions: decisions.map((d) => d.value) })
    );
    expect(state.legacyDecisions).toBe(0);
  });
  it('a decision example written without its round is read as round 1 (so the skill says to write it)', () => {
    const final = examples().find((e) => isDecision(e) && e.value.state === 'FINAL_REVIEW')!;
    expect(final.value.round).toBe(2);
    const parsed = ReviewDecisionRecordSchema.safeParse(final.value);
    expect(parsed.success && parsed.data.round).toBe(2);
    // Control: a round that is not a positive integer is unreadable, never silently round 1.
    expect(ReviewDecisionRecordSchema.safeParse({ ...final.value, round: 0 }).success).toBe(false);
  });
});
