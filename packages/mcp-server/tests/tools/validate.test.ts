import { describe, it, expect } from 'vitest';
import { validateToolDefinition, handleValidateProject } from '../../src/tools/validate';

describe('validate tool', () => {
  it('has correct definition', () => {
    expect(validateToolDefinition.name).toBe('validate_project');
    expect(validateToolDefinition.inputSchema.required).toContain('path');
  });

  it('returns error for missing config', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    expect(response.content).toHaveLength(1);
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.valid).toBe(false);
    expect(parsed.checks.config).toBe('fail');
    expect(Array.isArray(parsed.errors)).toBe(true);
    expect(parsed.errors.length).toBeGreaterThan(0);
  });

  it('returns structured result with checks and errors fields', async () => {
    const response = await handleValidateProject({ path: '/nonexistent/path' });
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed).toHaveProperty('valid');
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('errors');
    expect(parsed.checks).toHaveProperty('config');
    expect(parsed.checks).toHaveProperty('structure');
    expect(parsed.checks).toHaveProperty('agentsMap');
  });
});
