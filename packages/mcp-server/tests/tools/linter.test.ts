import { describe, it, expect } from 'vitest';
import {
  generateLinterDefinition,
  handleGenerateLinter,
  validateLinterConfigDefinition,
  handleValidateLinterConfig,
} from '../../src/tools/linter';

describe('generate_linter tool', () => {
  it('has correct definition', () => {
    expect(generateLinterDefinition.name).toBe('generate_linter');
    expect(generateLinterDefinition.inputSchema.required).toContain('configPath');
  });

  it('has configPath and outputDir properties', () => {
    expect(generateLinterDefinition.inputSchema.properties).toHaveProperty('configPath');
    expect(generateLinterDefinition.inputSchema.properties).toHaveProperty('outputDir');
  });

  it('returns error for nonexistent config', async () => {
    const response = await handleGenerateLinter({ configPath: '/nonexistent/harness-linter.yml' });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });
});

describe('validate_linter_config tool', () => {
  it('has correct definition', () => {
    expect(validateLinterConfigDefinition.name).toBe('validate_linter_config');
    expect(validateLinterConfigDefinition.inputSchema.required).toContain('configPath');
  });

  it('has configPath property', () => {
    expect(validateLinterConfigDefinition.inputSchema.properties).toHaveProperty('configPath');
  });

  it('returns error for nonexistent config', async () => {
    const response = await handleValidateLinterConfig({
      configPath: '/nonexistent/harness-linter.yml',
    });
    expect(response.isError).toBe(true);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].text).toBeDefined();
  });
});
