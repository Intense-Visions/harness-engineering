// agents/skills/tests/review-json-examples.test.ts
//
// Shift-left pipeline fidelity, Phase 1: every JSON example in the two skills' receipt and
// findings sections is parsed by the parsers the gate uses. An example that drifts from the
// schema fails here, not in an agent's review.

import { describe, it, expect } from 'vitest';
import { parseReviewReceipt, parseReviewerFindingsFile } from '@harness-engineering/core';
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
});
