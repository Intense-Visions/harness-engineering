import { describe, it, expect } from 'vitest';
import { listPersonasDefinition, generatePersonaArtifactsDefinition, runPersonaDefinition } from '../../src/tools/persona';

describe('persona tool definitions', () => {
  it('list_personas has correct schema', () => {
    expect(listPersonasDefinition.name).toBe('list_personas');
  });
  it('generate_persona_artifacts has correct schema', () => {
    expect(generatePersonaArtifactsDefinition.name).toBe('generate_persona_artifacts');
    expect(generatePersonaArtifactsDefinition.inputSchema.required).toContain('name');
  });
  it('run_persona has correct schema', () => {
    expect(runPersonaDefinition.name).toBe('run_persona');
    expect(runPersonaDefinition.inputSchema.required).toContain('persona');
  });
});
