import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

vi.mock('../../src/commands/generate-slash-commands', () => ({
  generateSlashCommands: vi.fn(() => [
    {
      platform: 'claude-code',
      added: [],
      updated: [],
      removed: [],
      unchanged: ['foo.md'],
      outputDir: '/home/.claude/commands/harness',
    },
    {
      platform: 'gemini-cli',
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      outputDir: '/home/.gemini/commands/harness',
    },
    {
      platform: 'codex',
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      outputDir: '/home/.codex/agents/harness',
    },
    {
      platform: 'cursor',
      added: [],
      updated: [],
      removed: [],
      unchanged: [],
      outputDir: '/home/.cursor/rules/harness',
    },
  ]),
}));

vi.mock('../../src/commands/setup-mcp', () => ({
  setupMcp: vi.fn(() => ({ configured: ['Claude Code'], skipped: [], trustedFolder: false })),
}));

vi.mock('../../src/utils/first-run', () => ({
  markSetupComplete: vi.fn(),
}));

const mockMcpConfig: Record<string, unknown> = { mcpServers: {} };
vi.mock('../../src/integrations/config', () => ({
  readMcpConfig: vi.fn(() => ({
    mcpServers: { ...(mockMcpConfig.mcpServers as Record<string, unknown>) },
  })),
  writeMcpEntry: vi.fn(),
}));

vi.mock('../../src/commands/telemetry-wizard', () => ({
  ensureTelemetryConfigured: vi.fn(() => ({
    status: 'warn',
    message: 'Not a harness project — skipped telemetry configuration',
  })),
}));

// Mock fs.existsSync for client detection
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
  };
});

import * as fs from 'fs';
import { runSetup, configureTier0Integrations } from '../../src/commands/setup';
import { generateSlashCommands } from '../../src/commands/generate-slash-commands';
import { setupMcp } from '../../src/commands/setup-mcp';
import { markSetupComplete } from '../../src/utils/first-run';
import { readMcpConfig, writeMcpEntry } from '../../src/integrations/config';

const mockExistsSync = vi.mocked(fs.existsSync);

function mockAllClientsExist() {
  mockExistsSync.mockImplementation((p: fs.PathLike) => {
    const s = String(p);
    if (s === path.join(os.homedir(), '.claude')) return true;
    if (s === path.join(os.homedir(), '.gemini')) return true;
    if (s === path.join(os.homedir(), '.codex')) return true;
    if (s === path.join(os.homedir(), '.cursor')) return true;
    return false;
  });
}

describe('runSetup', () => {
  const originalVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAllClientsExist();
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  it('passes all steps when Node >= 22 and all clients detected', async () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

    const { steps, success } = await runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(steps).toHaveLength(10);
    expect(steps[0].status).toBe('pass');
    expect(steps[0].message).toContain('Node.js');
    expect(steps[1].status).toBe('pass');
    expect(steps[1].message).toContain('slash commands');
    expect(generateSlashCommands).toHaveBeenCalledWith(
      expect.objectContaining({
        global: true,
        platforms: ['claude-code', 'gemini-cli', 'codex', 'cursor'],
        yes: true,
      })
    );
    expect(setupMcp).toHaveBeenCalledTimes(4);
    expect(steps[6].status).toBe('pass');
    expect(steps[6].message).toContain('MCP integrations');
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('fails immediately when Node < 22', async () => {
    Object.defineProperty(process, 'version', { value: 'v20.11.0', writable: true });

    const { steps, success } = await runSetup('/tmp/test');

    expect(success).toBe(false);
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe('fail');
    expect(steps[0].message).toContain('requires >=22');
    expect(generateSlashCommands).not.toHaveBeenCalled();
    expect(markSetupComplete).not.toHaveBeenCalled();
  });

  it('warns when a client directory is not detected', async () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return false;
      return false;
    });

    const { steps, success } = await runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(steps).toHaveLength(10);
    const geminiStep = steps[3];
    expect(geminiStep.status).toBe('warn');
    expect(geminiStep.message).toContain('Gemini CLI not detected');
    const codexStep = steps[4];
    expect(codexStep.status).toBe('warn');
    expect(codexStep.message).toContain('Codex CLI not detected');
    const cursorStep = steps[5];
    expect(cursorStep.status).toBe('warn');
    expect(cursorStep.message).toContain('Cursor not detected');
    expect(setupMcp).toHaveBeenCalledTimes(1);
    expect(setupMcp).toHaveBeenCalledWith('/tmp/test', 'claude');
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('warns when no clients are detected', async () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    mockExistsSync.mockReturnValue(false);

    const { steps, success } = await runSetup('/tmp/test');

    expect(success).toBe(true);
    expect(setupMcp).not.toHaveBeenCalled();
    const mcpSteps = steps.filter((s) => s.message.includes('not detected'));
    expect(mcpSteps).toHaveLength(4);
    expect(markSetupComplete).toHaveBeenCalled();
  });

  it('does not call markSetupComplete when slash generation fails', async () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
    (generateSlashCommands as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('skills dir missing');
    });

    const { steps, success } = await runSetup('/tmp/test');

    expect(success).toBe(false);
    expect(steps[1].status).toBe('fail');
    expect(steps[1].message).toContain('skills dir missing');
    expect(markSetupComplete).not.toHaveBeenCalled();
  });

  it('is idempotent — produces same results on second run', async () => {
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });

    const first = await runSetup('/tmp/test');
    vi.clearAllMocks();
    mockAllClientsExist();
    const second = await runSetup('/tmp/test');

    expect(first.success).toBe(second.success);
    expect(first.steps.length).toBe(second.steps.length);
  });
});

describe('configureTier0Integrations', () => {
  const mockWriteMcpEntry = vi.mocked(writeMcpEntry);
  const mockReadMcpConfig = vi.mocked(readMcpConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadMcpConfig.mockReturnValue({ mcpServers: {} });
  });

  it('adds all Tier 0 integrations when none are present', () => {
    const result = configureTier0Integrations('/tmp/test');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('Configured 3 MCP integrations');
    expect(result.message).toContain('Context7');
    expect(result.message).toContain('Sequential Thinking');
    expect(result.message).toContain('Playwright');
    expect(mockWriteMcpEntry).toHaveBeenCalledTimes(3);
    expect(mockWriteMcpEntry).toHaveBeenCalledWith(
      path.join('/tmp/test', '.mcp.json'),
      'context7',
      expect.objectContaining({ command: 'npx' })
    );
  });

  it('skips integrations that already exist in .mcp.json', () => {
    mockReadMcpConfig.mockReturnValue({
      mcpServers: {
        context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
      },
    });

    const result = configureTier0Integrations('/tmp/test');

    expect(result.status).toBe('pass');
    expect(result.message).toContain('Configured 1 MCP integrations');
    expect(result.message).toContain('Sequential Thinking');
    expect(result.message).not.toContain('Context7');
    expect(result.message).not.toContain('Playwright');
    expect(mockWriteMcpEntry).toHaveBeenCalledTimes(1);
  });

  it('reports already configured when all Tier 0 are present', () => {
    mockReadMcpConfig.mockReturnValue({
      mcpServers: {
        context7: { command: 'npx', args: [] },
        'sequential-thinking': { command: 'npx', args: [] },
        playwright: { command: 'npx', args: [] },
      },
    });

    const result = configureTier0Integrations('/tmp/test');

    expect(result.status).toBe('pass');
    expect(result.message).toBe('Tier 0 MCP integrations already configured');
    expect(mockWriteMcpEntry).not.toHaveBeenCalled();
  });

  it('also writes Tier 0 to .gemini/settings.json when .gemini dir exists', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      if (s === path.join('/tmp/test', '.gemini')) return true;
      if (s === path.join(os.homedir(), '.claude')) return true;
      if (s === path.join(os.homedir(), '.gemini')) return true;
      return false;
    });

    configureTier0Integrations('/tmp/test');

    // Should write to both .mcp.json and .gemini/settings.json
    const geminiCalls = mockWriteMcpEntry.mock.calls.filter(
      (call) => String(call[0]) === path.join('/tmp/test', '.gemini', 'settings.json')
    );
    expect(geminiCalls.length).toBe(3); // All 3 Tier 0 integrations
  });

  it('does not write to .gemini/settings.json when .gemini dir is absent', () => {
    mockExistsSync.mockReturnValue(false);

    configureTier0Integrations('/tmp/test');

    const geminiCalls = mockWriteMcpEntry.mock.calls.filter((call) =>
      String(call[0]).includes('.gemini')
    );
    expect(geminiCalls.length).toBe(0);
  });

  it('does not add Tier 1 integrations', () => {
    const result = configureTier0Integrations('/tmp/test');

    expect(result.message).not.toContain('Perplexity');
    expect(result.message).not.toContain('Augment');
  });

  it('returns fail status when an error occurs', () => {
    mockReadMcpConfig.mockImplementation(() => {
      throw new Error('permission denied');
    });

    const result = configureTier0Integrations('/tmp/test');

    expect(result.status).toBe('fail');
    expect(result.message).toContain('permission denied');
  });
});
