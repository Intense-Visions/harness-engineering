import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

import * as fs from 'fs';
import { runDoctor } from '../../src/commands/doctor';

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

// MCP config with harness + all Tier 0 integrations configured
const mcpJsonFull = JSON.stringify({
  mcpServers: {
    harness: { command: 'harness-mcp' },
    context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    'sequential-thinking': {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
    playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
  },
});
// Harness config with Tier 1 integrations dismissed (so no info suggestions)
const harnessConfigDismissed = JSON.stringify({
  integrations: { enabled: [], dismissed: ['perplexity', 'augment-code'] },
});
const claudeDir = path.join(os.homedir(), '.claude', 'commands', 'harness');
const geminiDir = path.join(os.homedir(), '.gemini', 'commands', 'harness');
// Note: checkMcpConfig checks cwd/.gemini/settings.json (project-local), not $HOME/.gemini/settings.json
const geminiSettingsForCwd = (cwd: string) => path.join(cwd, '.gemini', 'settings.json');

function buildExistsMap(cwd: string): Record<string, boolean> {
  return {
    [path.join(cwd, '.mcp.json')]: true,
    [path.join(cwd, '.gemini')]: true,
    [geminiSettingsForCwd(cwd)]: true,
    [path.join(cwd, 'harness.config.json')]: true,
  };
}

const readdirMap: Record<string, string[]> = {
  [claudeDir]: ['init.md', 'validate.md'],
  [geminiDir]: ['init.toml'],
};

function mockAllHealthy(cwd: string) {
  const existsMap = buildExistsMap(cwd);
  mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
  mockReaddirSync.mockImplementation(
    (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
  );

  const readMap: Record<string, string> = {
    [path.join(cwd, '.mcp.json')]: mcpJsonFull,
    [geminiSettingsForCwd(cwd)]: mcpJsonFull,
    [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
  };
  mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}');
}

describe('runDoctor', () => {
  const originalVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults (clearAllMocks doesn't reset mockImplementation)
    mockExistsSync.mockReturnValue(false);
    mockReaddirSync.mockReturnValue([] as unknown as fs.Dirent[]);
    mockReadFileSync.mockReturnValue('{}');
    Object.defineProperty(process, 'version', { value: 'v22.4.0', writable: true });
  });

  afterEach(() => {
    Object.defineProperty(process, 'version', { value: originalVersion, writable: true });
  });

  it('returns allPassed true when all checks pass', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(true);
    expect(result.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('reports Node version check', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const nodeCheck = result.checks.find((c) => c.name === 'node');

    expect(nodeCheck).toBeDefined();
    expect(nodeCheck!.status).toBe('pass');
    expect(nodeCheck!.message).toContain('Node.js');
    expect(nodeCheck!.message).toContain('v22.4.0');
  });

  it('fails Node version check when below 22', () => {
    Object.defineProperty(process, 'version', { value: 'v20.11.0', writable: true });
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const nodeCheck = result.checks.find((c) => c.name === 'node');

    expect(nodeCheck!.status).toBe('fail');
    expect(nodeCheck!.fix).toBeDefined();
    expect(result.allPassed).toBe(false);
  });

  it('reports slash command counts per platform', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const claudeSlash = result.checks.find((c) => c.name === 'slash-commands-claude-code');

    expect(claudeSlash!.status).toBe('pass');
    expect(claudeSlash!.message).toContain('2 commands');
  });

  it('fails slash command check when directory is empty or missing', () => {
    mockAllHealthy('/tmp/project');
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');
    const slashChecks = result.checks.filter((c) => c.name.startsWith('slash-commands'));

    expect(slashChecks.every((c) => c.status === 'fail')).toBe(true);
    expect(slashChecks.every((c) => c.fix !== undefined)).toBe(true);
  });

  it('passes MCP check when harness entry exists in .mcp.json', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');
    const mcpClaude = result.checks.find((c) => c.name === 'mcp-claude');

    expect(mcpClaude!.status).toBe('pass');
    expect(mcpClaude!.message).toContain('Claude Code');
  });

  it('fails MCP check with fix suggestion when not configured', () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');
    const mcpClaude = result.checks.find((c) => c.name === 'mcp-claude');
    const mcpGemini = result.checks.find((c) => c.name === 'mcp-gemini');

    expect(mcpClaude!.status).toBe('fail');
    expect(mcpClaude!.fix).toContain('harness setup-mcp --client claude');
    expect(mcpGemini!.status).toBe('fail');
    expect(mcpGemini!.fix).toContain('harness setup-mcp --client gemini');
  });

  it('returns correct check count', () => {
    mockAllHealthy('/tmp/project');

    const result = runDoctor('/tmp/project');

    // node + 2 slash command platforms + 2 MCP platforms + 3 Tier 0 integrations = 8 checks
    // (Tier 1 dismissed, so no info checks)
    expect(result.checks).toHaveLength(8);
  });

  it('is read-only — does not call writeFileSync or mkdirSync', () => {
    const writeFileSpy = vi.mocked(fs.writeFileSync);
    const mkdirSpy = vi.mocked(fs.mkdirSync);
    mockAllHealthy('/tmp/project');

    runDoctor('/tmp/project');

    expect(writeFileSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
  });

  it('returns allPassed false when any check fails', () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const result = runDoctor('/tmp/project');

    expect(result.allPassed).toBe(false);
    const failCount = result.checks.filter((c) => c.status === 'fail').length;
    expect(failCount).toBeGreaterThan(0);
  });

  describe('integration checks', () => {
    it('fails when a Tier 0 integration is missing from .mcp.json', () => {
      const cwd = '/tmp/project';
      // MCP config with harness but WITHOUT context7
      const mcpNoContext7 = JSON.stringify({
        mcpServers: {
          harness: { command: 'harness-mcp' },
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
        },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpNoContext7,
        [geminiSettingsForCwd(cwd)]: mcpNoContext7,
        [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const context7Check = result.checks.find((c) => c.name === 'integration-context7');

      expect(context7Check).toBeDefined();
      expect(context7Check!.status).toBe('fail');
      expect(context7Check!.message).toContain('Context7');
      expect(context7Check!.message).toContain('harness setup');
      expect(result.allPassed).toBe(false);
    });

    it('passes when all Tier 0 integrations are in .mcp.json', () => {
      mockAllHealthy('/tmp/project');

      const result = runDoctor('/tmp/project');
      const tier0Checks = result.checks.filter(
        (c) => c.name.startsWith('integration-') && !c.name.endsWith('-env')
      );

      const tier0Pass = tier0Checks.filter((c) => c.status === 'pass');
      expect(tier0Pass).toHaveLength(3); // context7, sequential-thinking, playwright
    });

    it('shows info suggestions for non-enabled, non-dismissed Tier 1 integrations', () => {
      const cwd = '/tmp/project';
      // No dismissed integrations — Tier 1 should show as info
      const harnessConfigEmpty = JSON.stringify({
        integrations: { enabled: [], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEmpty,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const perplexityCheck = result.checks.find((c) => c.name === 'integration-perplexity');

      expect(perplexityCheck).toBeDefined();
      expect(perplexityCheck!.status).toBe('info');
      expect(perplexityCheck!.message).toContain('Perplexity');
      expect(perplexityCheck!.message).toContain('harness integrations add perplexity');
    });

    it('info status does not cause allPassed to be false', () => {
      const cwd = '/tmp/project';
      const harnessConfigEmpty = JSON.stringify({
        integrations: { enabled: [], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEmpty,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const infoChecks = result.checks.filter((c) => c.status === 'info');

      expect(infoChecks.length).toBeGreaterThan(0);
      expect(result.allPassed).toBe(true);
    });

    it('warns when Tier 0 integration in Claude but missing from Gemini', () => {
      const cwd = '/tmp/project';
      // Gemini config missing context7
      const geminiNoContext7 = JSON.stringify({
        mcpServers: {
          harness: { command: 'harness-mcp' },
          'sequential-thinking': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
          },
          playwright: { command: 'npx', args: ['-y', '@playwright/mcp'] },
        },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, '.gemini')]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: geminiNoContext7,
        [path.join(cwd, 'harness.config.json')]: harnessConfigDismissed,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );

      const result = runDoctor(cwd);
      const context7Check = result.checks.find((c) => c.name === 'integration-context7');

      expect(context7Check).toBeDefined();
      expect(context7Check!.status).toBe('warn');
      expect(context7Check!.message).toContain('Gemini CLI');
      // warn should not fail allPassed
      expect(result.allPassed).toBe(true);
    });

    it('does not suggest dismissed Tier 1 integrations', () => {
      mockAllHealthy('/tmp/project');

      const result = runDoctor('/tmp/project');
      const perplexityCheck = result.checks.find((c) => c.name === 'integration-perplexity');

      // perplexity is dismissed in mockAllHealthy, so no check should exist
      expect(perplexityCheck).toBeUndefined();
    });

    it('warns when enabled Tier 1 integration has missing env var', () => {
      const cwd = '/tmp/project';
      const harnessConfigEnabled = JSON.stringify({
        integrations: { enabled: ['perplexity'], dismissed: [] },
      });
      const existsMap: Record<string, boolean> = {
        [path.join(cwd, '.mcp.json')]: true,
        [geminiSettingsForCwd(cwd)]: true,
        [path.join(cwd, 'harness.config.json')]: true,
      };
      mockExistsSync.mockImplementation((p: fs.PathLike) => existsMap[String(p)] ?? false);
      mockReaddirSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => (readdirMap[String(p)] ?? []) as unknown as fs.Dirent[]
      );
      const readMap: Record<string, string> = {
        [path.join(cwd, '.mcp.json')]: mcpJsonFull,
        [geminiSettingsForCwd(cwd)]: mcpJsonFull,
        [path.join(cwd, 'harness.config.json')]: harnessConfigEnabled,
      };
      mockReadFileSync.mockImplementation(
        (p: fs.PathOrFileDescriptor) => readMap[String(p)] ?? '{}'
      );
      // Ensure PERPLEXITY_API_KEY is not set
      const origEnv = process.env.PERPLEXITY_API_KEY;
      delete process.env.PERPLEXITY_API_KEY;

      const result = runDoctor(cwd);
      const envCheck = result.checks.find((c) => c.name === 'integration-perplexity-env');

      expect(envCheck).toBeDefined();
      expect(envCheck!.status).toBe('warn');
      expect(envCheck!.message).toContain('PERPLEXITY_API_KEY');
      expect(envCheck!.message).toContain('Perplexity');
      // warn should not cause allPassed to be false
      expect(result.allPassed).toBe(true);

      // Restore
      if (origEnv !== undefined) process.env.PERPLEXITY_API_KEY = origEnv;
    });
  });
});
