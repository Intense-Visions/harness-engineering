import { describe, it, expect } from 'vitest';
import { getProjectResource } from '../../../src/mcp/resources/project';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../..');

describe('getProjectResource', () => {
  it('returns AGENTS.md content from the project root', async () => {
    const result = await getProjectResource(PROJECT_ROOT);
    expect(result).toContain('AGENTS');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns fallback when AGENTS.md does not exist', async () => {
    const result = await getProjectResource('/tmp/nonexistent-project');
    expect(result).toBe('# No AGENTS.md found');
  });
});
