import { describe, it, expect } from 'vitest';
import { validateToolDefinition, handleValidateProject } from '../../src/tools/validate';

describe('validate tool', () => {
  it('has correct definition', () => {
    expect(validateToolDefinition.name).toBe('validate_project');
    expect(validateToolDefinition.inputSchema.required).toContain('path');
  });

  it('returns error for missing config', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    expect((response as any).isError).toBe(true);
  });
});
