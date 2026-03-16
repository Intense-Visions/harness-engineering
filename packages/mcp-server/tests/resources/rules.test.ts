import { describe, it, expect } from 'vitest';
import { getRulesResource } from '../../src/resources/rules';

describe('getRulesResource', () => {
  it('returns empty array when no config exists', async () => {
    const result = await getRulesResource('/tmp/nonexistent-project');
    const rules = JSON.parse(result);
    expect(rules).toEqual([]);
  });

  it('returns valid JSON', async () => {
    const result = await getRulesResource(process.cwd());
    expect(() => JSON.parse(result)).not.toThrow();
  });
});
