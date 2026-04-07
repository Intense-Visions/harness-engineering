import { describe, it, expect, vi } from 'vitest';
import { handleGeneratePersonaArtifacts, handleRunPersona } from '../../../src/mcp/tools/persona';

vi.mock('../../../src/persona/loader.js', () => ({
  loadPersona: () => ({ ok: false, error: new Error('persona file not found (expected in test)') }),
}));

vi.mock('../../../src/persona/runner.js', () => ({
  runPersona: vi.fn(),
}));

vi.mock('../../../src/persona/skill-executor.js', () => ({
  executeSkill: vi.fn(),
}));

vi.mock('../../../src/persona/generators/runtime.js', () => ({
  generateRuntime: vi.fn(),
}));

vi.mock('../../../src/persona/generators/agents-md.js', () => ({
  generateAgentsMd: vi.fn(),
}));

vi.mock('../../../src/persona/generators/ci-workflow.js', () => ({
  generateCIWorkflow: vi.fn(),
}));

vi.mock('../../../src/persona/constants.js', () => ({
  ALLOWED_PERSONA_COMMANDS: new Set(),
}));

describe('persona path traversal prevention', () => {
  describe('handleGeneratePersonaArtifacts', () => {
    it('rejects names with path traversal', async () => {
      const result = await handleGeneratePersonaArtifacts({ name: '../../etc/passwd' });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Invalid persona name');
    });

    it('rejects names with directory separators', async () => {
      const result = await handleGeneratePersonaArtifacts({ name: 'foo/bar' });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Invalid persona name');
    });

    it('rejects names starting with a dot', async () => {
      const result = await handleGeneratePersonaArtifacts({ name: '.secret' });
      expect(result.isError).toBe(true);
    });

    it('rejects empty name', async () => {
      const result = await handleGeneratePersonaArtifacts({ name: '' });
      expect(result.isError).toBe(true);
    });

    it('accepts valid kebab-case names', async () => {
      const result = await handleGeneratePersonaArtifacts({ name: 'architecture-enforcer' });
      if (result.isError) {
        const text = (result.content[0] as { text: string }).text;
        expect(text).not.toContain('Invalid persona name');
        expect(text).not.toContain('Invalid persona path');
      }
    });
  });

  describe('handleRunPersona', () => {
    it('rejects persona with path traversal', async () => {
      const result = await handleRunPersona({ persona: '../../../etc/shadow' });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Invalid persona name');
    });

    it('rejects persona with directory separators', async () => {
      const result = await handleRunPersona({ persona: 'dir/name' });
      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('Invalid persona name');
    });

    it('rejects empty persona name', async () => {
      const result = await handleRunPersona({ persona: '' });
      expect(result.isError).toBe(true);
    });

    it('accepts valid kebab-case persona names', async () => {
      const result = await handleRunPersona({ persona: 'code-reviewer' });
      if (result.isError) {
        const text = (result.content[0] as { text: string }).text;
        expect(text).not.toContain('Invalid persona name');
        expect(text).not.toContain('Invalid persona path');
      }
    });
  });
});
