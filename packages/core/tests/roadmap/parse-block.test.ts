import { describe, it, expect } from 'vitest';
import { parseFeatureBlock } from '../../src/roadmap/parse';
import { serializeFeature } from '../../src/roadmap/serialize';

const BLOCK = [
  '- **Status:** planned',
  '- **Spec:** docs/changes/x/proposal.md',
  '- **Summary:** A summary',
  '- **Blockers:** —',
  '- **Plan:** —',
  '- **Assignee:** —',
  '- **Priority:** P1',
  '- **External-ID:** github:o/r#7',
  '- **Updated-At:** 2026-06-27T12:00:00.000Z',
].join('\n');

describe('parseFeatureBlock()', () => {
  it('parses a single row bullet block by name + body', () => {
    const r = parseFeatureBlock('Do the thing', BLOCK);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe('Do the thing');
      expect(r.value.status).toBe('planned');
      expect(r.value.priority).toBe('P1');
      expect(r.value.externalId).toBe('github:o/r#7');
    }
  });

  it('round-trips through serializeFeature', () => {
    const r = parseFeatureBlock('Do the thing', BLOCK);
    if (!r.ok) throw r.error;
    const md = serializeFeature(r.value).join('\n');
    const r2 = parseFeatureBlock('Do the thing', md);
    expect(r2).toEqual(r);
  });
});
