import { describe, it, expect } from 'vitest';
import { NODE_STABILITY } from '../../src/types';

describe('NODE_STABILITY', () => {
  it('maps File to session', () => {
    expect(NODE_STABILITY.File).toBe('session');
  });

  it('maps Function to session', () => {
    expect(NODE_STABILITY.Function).toBe('session');
  });

  it('maps Class to session', () => {
    expect(NODE_STABILITY.Class).toBe('session');
  });

  it('maps Constraint to session', () => {
    expect(NODE_STABILITY.Constraint).toBe('session');
  });

  it('maps PackedSummary to session', () => {
    expect(NODE_STABILITY.PackedSummary).toBe('session');
  });

  it('maps SkillDefinition to static', () => {
    expect(NODE_STABILITY.SkillDefinition).toBe('static');
  });

  it('maps ToolDefinition to static', () => {
    expect(NODE_STABILITY.ToolDefinition).toBe('static');
  });

  it('contains exactly 7 entries', () => {
    expect(Object.keys(NODE_STABILITY)).toHaveLength(7);
  });
});
