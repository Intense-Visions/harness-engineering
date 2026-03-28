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

function mockAllHealthy(cwd: string) {
  mockExistsSync.mockImplementation((p: fs.PathLike) => {
    const s = String(p);
    if (s === path.join(cwd, '.mcp.json')) return true;
    if (s === path.join(os.homedir(), '.gemini', 'settings.json')) return true;
    return false;
  });

  mockReaddirSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
    const s = String(p);
    const claudeDir = path.join(os.homedir(), '.claude', 'commands', 'harness');
    const geminiDir = path.join(os.homedir(), '.gemini', 'commands', 'harness');
    if (s === claudeDir) return ['init.md', 'validate.md'] as unknown as fs.Dirent[];
    if (s === geminiDir) return ['init.toml'] as unknown as fs.Dirent[];
    return [] as unknown as fs.Dirent[];
  });

  mockReadFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
    const s = String(p);
    if (s === path.join(cwd, '.mcp.json')) {
      return JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } });
    }
    if (s === path.join(os.homedir(), '.gemini', 'settings.json')) {
      return JSON.stringify({ mcpServers: { harness: { command: 'harness-mcp' } } });
    }
    return '{}';
  });
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

    // node + 2 slash command platforms + 2 MCP platforms = 5 checks
    expect(result.checks).toHaveLength(5);
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
});
