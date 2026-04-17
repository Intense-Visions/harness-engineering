import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleListPersonas,
  handleGeneratePersonaArtifacts,
  handleRunPersona,
} from '../../../src/mcp/tools/persona';

// Mock persona loader
vi.mock('../../../src/persona/loader', () => ({
  listPersonas: vi.fn(),
  loadPersona: vi.fn(),
}));

// Mock persona generators
vi.mock('../../../src/persona/generators/runtime', () => ({
  generateRuntime: vi.fn(),
}));

vi.mock('../../../src/persona/generators/agents-md', () => ({
  generateAgentsMd: vi.fn(),
}));

vi.mock('../../../src/persona/generators/ci-workflow', () => ({
  generateCIWorkflow: vi.fn(),
}));

// Mock persona runner and skill executor
vi.mock('../../../src/persona/runner', () => ({
  runPersona: vi.fn(),
}));

vi.mock('../../../src/persona/skill-executor', () => ({
  executeSkill: vi.fn(),
}));

vi.mock('../../../src/persona/constants', () => ({
  ALLOWED_PERSONA_COMMANDS: new Set(['validate', 'check-arch']),
}));

// Mock paths
vi.mock('../../../src/utils/paths', () => ({
  resolvePersonasDir: vi.fn(() => '/mock/personas'),
}));

import { listPersonas, loadPersona } from '../../../src/persona/loader';
import { generateRuntime } from '../../../src/persona/generators/runtime';
import { generateAgentsMd } from '../../../src/persona/generators/agents-md';
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow';
import { runPersona } from '../../../src/persona/runner';

const mockedListPersonas = vi.mocked(listPersonas);
const mockedLoadPersona = vi.mocked(loadPersona);
const mockedGenerateRuntime = vi.mocked(generateRuntime);
const mockedGenerateAgentsMd = vi.mocked(generateAgentsMd);
const mockedGenerateCIWorkflow = vi.mocked(generateCIWorkflow);
const mockedRunPersona = vi.mocked(runPersona);

describe('handleListPersonas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns persona list on success', async () => {
    mockedListPersonas.mockReturnValue({
      ok: true,
      value: [{ name: 'arch-enforcer', description: 'Enforces architecture' }],
    } as any);
    const result = await handleListPersonas();
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('arch-enforcer');
  });

  it('returns error when listing fails', async () => {
    mockedListPersonas.mockReturnValue({
      ok: false,
      error: new Error('No personas directory'),
    } as any);
    const result = await handleListPersonas();
    expect(result.isError).toBe(true);
  });
});

describe('handleGeneratePersonaArtifacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid persona names', async () => {
    const result = await handleGeneratePersonaArtifacts({ name: '../bad-name' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid persona name');
  });

  it('returns error when persona loading fails', async () => {
    mockedLoadPersona.mockReturnValue({
      ok: false,
      error: new Error('Persona not found'),
    } as any);
    const result = await handleGeneratePersonaArtifacts({ name: 'nonexistent' });
    expect(result.isError).toBe(true);
  });

  it('generates all artifacts when no only filter', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedGenerateRuntime.mockReturnValue({ ok: true, value: 'runtime-config' } as any);
    mockedGenerateAgentsMd.mockReturnValue({ ok: true, value: '# Agents' } as any);
    mockedGenerateCIWorkflow.mockReturnValue({ ok: true, value: 'ci-yaml' } as any);

    const result = await handleGeneratePersonaArtifacts({ name: 'test-persona' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.runtime).toBe('runtime-config');
    expect(parsed.agentsMd).toBe('# Agents');
    expect(parsed.ciWorkflow).toBe('ci-yaml');
  });

  it('generates only runtime when only=runtime', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedGenerateRuntime.mockReturnValue({ ok: true, value: 'runtime-config' } as any);

    const result = await handleGeneratePersonaArtifacts({ name: 'test-persona', only: 'runtime' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.runtime).toBe('runtime-config');
    expect(parsed.agentsMd).toBeUndefined();
    expect(parsed.ciWorkflow).toBeUndefined();
  });

  it('generates only agents-md when only=agents-md', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedGenerateAgentsMd.mockReturnValue({ ok: true, value: '# Agents' } as any);

    const result = await handleGeneratePersonaArtifacts({
      name: 'test-persona',
      only: 'agents-md',
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.agentsMd).toBe('# Agents');
    expect(parsed.runtime).toBeUndefined();
  });

  it('generates only ci when only=ci', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedGenerateCIWorkflow.mockReturnValue({ ok: true, value: 'ci-yaml' } as any);

    const result = await handleGeneratePersonaArtifacts({ name: 'test-persona', only: 'ci' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ciWorkflow).toBe('ci-yaml');
    expect(parsed.runtime).toBeUndefined();
  });
});

describe('handleRunPersona', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid persona names', async () => {
    const result = await handleRunPersona({ persona: '../bad' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid persona name');
  });

  it('returns error when persona loading fails', async () => {
    mockedLoadPersona.mockReturnValue({
      ok: false,
      error: new Error('Not found'),
    } as any);
    const result = await handleRunPersona({ persona: 'nonexistent' });
    expect(result.isError).toBe(true);
  });

  it('runs persona and returns report on success', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedRunPersona.mockResolvedValue({
      persona: 'test-persona',
      trigger: 'manual',
      steps: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    });

    const result = await handleRunPersona({ persona: 'test-persona', path: '/tmp/test' });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.persona).toBe('test-persona');
  });

  it('uses cwd when no path provided', async () => {
    const mockPersona = {
      name: 'test-persona',
      description: 'Test',
      config: { timeout: 30000 },
      steps: [],
    };
    mockedLoadPersona.mockReturnValue({ ok: true, value: mockPersona } as any);
    mockedRunPersona.mockResolvedValue({
      persona: 'test-persona',
      trigger: 'auto',
      steps: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
    });

    const result = await handleRunPersona({ persona: 'test-persona' });
    expect(result.isError).toBeFalsy();
  });
});
