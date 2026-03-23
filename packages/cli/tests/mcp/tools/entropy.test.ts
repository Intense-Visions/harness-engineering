import { describe, it, expect } from 'vitest';
import { detectEntropyDefinition } from '../../../src/mcp/tools/entropy';

describe('detect_entropy tool', () => {
  it('has type parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('type');
    expect(detectEntropyDefinition.inputSchema.properties.type.enum).toEqual([
      'drift',
      'dead-code',
      'patterns',
      'all',
    ]);
  });

  it('has autoFix parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('autoFix');
    expect(detectEntropyDefinition.inputSchema.properties.autoFix).toEqual({
      type: 'boolean',
      description: 'When true, apply fixes after analysis. Default: false (analysis only)',
    });
  });

  it('has dryRun parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('dryRun');
  });

  it('has fixTypes parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('fixTypes');
  });

  it('description mentions fix capability', () => {
    expect(detectEntropyDefinition.description).toContain('fix');
  });

  it('has mode parameter in definition', () => {
    expect(detectEntropyDefinition.inputSchema.properties).toHaveProperty('mode');
    expect(detectEntropyDefinition.inputSchema.properties.mode.enum).toEqual([
      'summary',
      'detailed',
    ]);
  });
});
