import { describe, it, expect } from 'vitest';
import { gatherContextDefinition } from '../../../src/mcp/tools/gather-context';

describe('gather_context session parameter', () => {
  it('input schema includes session property', () => {
    const props = gatherContextDefinition.inputSchema.properties;
    expect(props).toHaveProperty('session');
    expect((props as Record<string, { type: string }>).session.type).toBe('string');
  });

  it('include enum contains sessions value', () => {
    const includeProp = gatherContextDefinition.inputSchema.properties.include;
    expect(includeProp.items.enum).toContain('sessions');
  });

  it('session is not in required fields (backwards compatible)', () => {
    const required = gatherContextDefinition.inputSchema.required;
    expect(required).not.toContain('session');
  });
});
