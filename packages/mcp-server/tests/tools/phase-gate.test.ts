import { describe, it, expect } from 'vitest';
import { checkPhaseGateDefinition } from '../../src/tools/phase-gate';

describe('check_phase_gate tool', () => {
  it('has correct definition name', () => {
    expect(checkPhaseGateDefinition.name).toBe('check_phase_gate');
  });

  it('requires path parameter', () => {
    expect(checkPhaseGateDefinition.inputSchema.required).toContain('path');
  });

  it('has path property in schema', () => {
    expect(checkPhaseGateDefinition.inputSchema.properties).toHaveProperty('path');
  });
});
