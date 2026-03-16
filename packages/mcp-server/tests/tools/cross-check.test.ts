import { describe, it, expect } from 'vitest';
import { validateCrossCheckDefinition } from '../../src/tools/cross-check';

describe('validate_cross_check tool', () => {
  it('has correct definition name', () => {
    expect(validateCrossCheckDefinition.name).toBe('validate_cross_check');
  });

  it('requires path parameter', () => {
    expect(validateCrossCheckDefinition.inputSchema.required).toContain('path');
  });

  it('has path property in schema', () => {
    expect(validateCrossCheckDefinition.inputSchema.properties).toHaveProperty('path');
  });

  it('has optional specsDir property in schema', () => {
    expect(validateCrossCheckDefinition.inputSchema.properties).toHaveProperty('specsDir');
    expect(validateCrossCheckDefinition.inputSchema.required).not.toContain('specsDir');
  });

  it('has optional plansDir property in schema', () => {
    expect(validateCrossCheckDefinition.inputSchema.properties).toHaveProperty('plansDir');
    expect(validateCrossCheckDefinition.inputSchema.required).not.toContain('plansDir');
  });
});
