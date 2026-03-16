import { describe, it, expect } from 'vitest';
import { getLearningsResource } from '../../src/resources/learnings';

describe('getLearningsResource', () => {
  it('returns fallback when no learnings files exist', async () => {
    const result = await getLearningsResource('/tmp/nonexistent-project');
    expect(result).toBe('No learnings files found.');
  });
});
