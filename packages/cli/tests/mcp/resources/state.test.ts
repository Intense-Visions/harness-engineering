import { describe, it, expect } from 'vitest';
import { getStateResource } from '../../../src/mcp/resources/state';

describe('state resource', () => {
  it('returns valid JSON for nonexistent project', async () => {
    const result = await getStateResource('/nonexistent/path');
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('schemaVersion');
  });
});
