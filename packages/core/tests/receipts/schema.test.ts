import { describe, it, expect } from 'vitest';
import {
  BLOCKING_SEVERITIES,
  isBlockingSeverity,
  parseReviewReceipt,
  parseReviewerFindingsFile,
} from '../../src/receipts/schema';
import { normalizeReviewPath, pathEscapes } from '../../src/receipts/paths';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const receipt = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  moment: 'phase',
  tier: 'light',
  backend: 'agent',
  diff: { base: BASE, head: HEAD },
  coldContext: true,
  priorFindingsSupplied: false,
  reviewers: [
    { id: 'compliance-bug', required: true, ran: true, findingsPath: 'compliance-bug.json' },
  ],
  blocking: 0,
  advisory: 0,
  ...over,
});
const finding = (over: Record<string, unknown> = {}) => ({
  id: 'bug-src/a.ts-3',
  file: 'src/a.ts',
  lineRange: [3, 4],
  severity: 'suggestion',
  title: 't',
  rationale: 'kept: extra finding fields pass through',
  ...over,
});
const file = (findings: unknown[]) => ({
  schemaVersion: 1,
  reviewerId: 'bug',
  head: 'b'.repeat(40),
  examinedFiles: ['src/a.ts'],
  findings,
});

describe('review receipt schema', () => {
  it('accepts a well-formed receipt and keeps diff.baseSource', () => {
    const r = parseReviewReceipt(
      receipt({ diff: { base: BASE, head: HEAD, baseSource: 'starting-commit' } })
    );
    expect(r.ok && r.value.diff.baseSource).toBe('starting-commit');
  });
  it.each([
    ['an abbreviated sha', { diff: { base: 'abc1234', head: HEAD } }],
    ['an unknown tier', { tier: 'deep' }],
    ['an unknown moment', { moment: 'nightly' }],
    ['no reviewers', { reviewers: [] }],
    ['a negative count', { blocking: -1 }],
    ['schemaVersion 2', { schemaVersion: 2 }],
  ])('rejects %s and names the field', (_name, over) => {
    const r = parseReviewReceipt(receipt(over));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/^invalid review receipt: \S+: /);
  });
  it('rejects a non-object', () => {
    expect(parseReviewReceipt('nope').ok).toBe(false);
  });
});

describe('reviewer findings file schema', () => {
  it('accepts suggestions without attribution and keeps unknown finding fields', () => {
    const r = parseReviewerFindingsFile(file([finding()]));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect((r.value.findings[0] as unknown as { rationale: string }).rationale).toMatch(/^kept/);
  });
  it.each(BLOCKING_SEVERITIES)('requires findingClass and escapedFrom on a %s finding', (s) => {
    const bare = parseReviewerFindingsFile(file([finding({ severity: s })]));
    expect(bare.ok).toBe(false);
    if (!bare.ok) expect(bare.error.message).toMatch(/findingClass.*escapedFrom/s);
    const tagged = parseReviewerFindingsFile(
      file([finding({ severity: s, findingClass: 'edge-case', escapedFrom: 'plan' })])
    );
    expect(tagged.ok).toBe(true);
  });
  it('rejects an unknown class or stage', () => {
    const f = finding({ severity: 'critical', findingClass: 'typo', escapedFrom: 'review' });
    expect(parseReviewerFindingsFile(file([f])).ok).toBe(false);
  });
  it('requires the head the reviewer read, as a full sha', () => {
    const { head: _head, ...noHead } = file([]);
    expect(parseReviewerFindingsFile(noHead).ok).toBe(false);
    expect(parseReviewerFindingsFile({ ...file([]), head: 'abc1234' }).ok).toBe(false);
  });
  it('rejects a reviewer id that is not a safe file stem', () => {
    expect(parseReviewerFindingsFile({ ...file([]), reviewerId: '../bug' }).ok).toBe(false);
  });
});

describe('helpers', () => {
  it('treats critical and important as blocking, suggestion as advisory', () => {
    expect(BLOCKING_SEVERITIES).toEqual(['critical', 'important']);
    expect(isBlockingSeverity('suggestion')).toBe(false);
  });
  it('normalizes separators and a leading ./ so win32 paths compare equal', () => {
    expect(normalizeReviewPath('.\\src\\a.ts')).toBe('src/a.ts');
    expect(normalizeReviewPath('./src/a.ts')).toBe('src/a.ts');
  });
});

/**
 * Input partition for the one path-escape rule: empty, a plain name, nested, a dot-dot name that
 * is not a segment, a leading `..`, an inner `..`, absolute POSIX, absolute win32, drive-relative,
 * and each of those with back slashes.
 */
describe('pathEscapes', () => {
  it.each([
    ['', false],
    ['a.json', false],
    ['sub/a.json', false],
    ['..hidden.json', false],
    ['a..b/c', false],
    ['./a.json', false],
    ['..', true],
    ['../a.json', true],
    ['sub/../a.json', true],
    ['sub/../../a.json', true],
    ['/etc/passwd', true],
    ['C:\\x\\a.json', true],
    ['C:a.json', true],
    ['..\\a.json', true],
    ['sub\\..\\a.json', true],
    ['\\\\server\\share', true],
  ])('%j -> %s', (p, escapes) => {
    expect(pathEscapes(p)).toBe(escapes);
  });
});
