import { describe, it, expect } from 'vitest';
import { detectEntropyDefinition, applyFixesDefinition } from '../../src/tools/entropy';

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
});

describe('apply_fixes tool', () => {
  it('description mentions suggestions', () => {
    expect(applyFixesDefinition.description).toContain('suggestion');
  });
});
