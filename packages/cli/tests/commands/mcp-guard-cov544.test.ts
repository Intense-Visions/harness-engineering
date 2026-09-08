import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const mockCheck = vi.fn();
vi.mock('@harness-engineering/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@harness-engineering/core')>();
  return {
    ...actual,
    createOsvClient: () => ({ check: (...a: unknown[]) => mockCheck(...a) }),
  };
});

import {
  createMcpGuardCommand,
  extractNpmPackages,
  runMcpGuardCheck,
} from '../../src/commands/mcp-guard';

let logOutput: string[];
let exitCode: number | undefined;
const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => {
  logOutput.push(a.map(String).join(' '));
});
const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
  exitCode = code;
  throw new Error('exit:' + code);
}) as never);

let dir: string;

function writeConfig(obj: unknown): void {
  writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify(obj), 'utf-8');
}

function run(args: string[]): Promise<unknown> {
  const parent = new Command();
  parent.addCommand(createMcpGuardCommand());
  parent.exitOverride();
  return parent.parseAsync(['mcp-guard', ...args], { from: 'user' });
}

beforeEach(() => {
  vi.clearAllMocks();
  logOutput = [];
  exitCode = undefined;
  dir = mkdtempSync(path.join(tmpdir(), 'mcp-guard-cov-'));
  mockCheck.mockResolvedValue({ source: 'network', malicious: [], other: [] });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

afterAll(() => {
  logSpy.mockRestore();
  exitSpy.mockRestore();
});

describe('extractNpmPackages edge branches (cov544)', () => {
  it('skips a null server entry', () => {
    expect(extractNpmPackages({ mcpServers: { x: null as never } })).toEqual([]);
  });

  it('skips an npx entry whose args are all flags (no spec)', () => {
    expect(
      extractNpmPackages({ mcpServers: { x: { command: 'npx', args: ['-y', '--foo'] } } })
    ).toEqual([]);
  });

  it('handles an npx entry with no args array at all', () => {
    expect(extractNpmPackages({ mcpServers: { x: { command: 'npx' } } })).toEqual([]);
  });
});

describe('runMcpGuardCheck cwd default (cov544)', () => {
  it('defaults cwd to process.cwd() when none is provided', async () => {
    const result = await runMcpGuardCheck();
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('checked');
  });
});

describe('mcp-guard check action (cov544)', () => {
  it('no .mcp.json → "No MCP servers ... detected." and exit 0', async () => {
    await expect(run(['check', '--path', dir])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('No MCP servers launched via npx detected.');
  });

  it('clean network result prints a green check and exits 0', async () => {
    writeConfig({ mcpServers: { fs: { command: 'npx', args: ['@scope/fs@1.0.0'] } } });
    mockCheck.mockResolvedValue({ source: 'network', malicious: [], other: [] });
    await expect(run(['check', '--path', dir])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('fs');
  });

  it('a versionless package renders without an @version and omits version in the query', async () => {
    writeConfig({ mcpServers: { bare: { command: 'npx', args: ['barepkg'] } } });
    mockCheck.mockResolvedValue({ source: 'network', malicious: [], other: [] });
    await expect(run(['check', '--path', dir])).rejects.toThrow('exit:0');
    expect(logOutput.join('\n')).toContain('bare');
    // check() was called without a version field for a versionless spec.
    expect(mockCheck).toHaveBeenCalledWith(
      expect.not.objectContaining({ version: expect.anything() })
    );
  });

  it('clean cache result renders the (cache) marker and any other advisories', async () => {
    writeConfig({ mcpServers: { fs: { command: 'npx', args: ['@scope/fs@1.0.0'] } } });
    mockCheck.mockResolvedValue({
      source: 'cache',
      malicious: [],
      other: [{ id: 'GHSA-x', summary: 'note' }],
    });
    await expect(run(['check', '--path', dir])).rejects.toThrow('exit:0');
    const out = logOutput.join('\n');
    expect(out).toContain('(cache)');
    expect(out).toContain('non-malicious advisory');
  });

  it('malicious result prints red rows (with and without summary) and exits 2', async () => {
    writeConfig({ mcpServers: { bad: { command: 'npx', args: ['-y', 'evil-pkg@2.1.0'] } } });
    mockCheck.mockResolvedValue({
      source: 'network',
      malicious: [{ id: 'MAL-1', summary: 'is malware' }, { id: 'MAL-2' }],
      other: [],
    });
    await expect(run(['check', '--path', dir])).rejects.toThrow('exit:2');
    expect(exitCode).toBe(2);
    const out = logOutput.join('\n');
    expect(out).toContain('MAL-1');
    expect(out).toContain('is malware');
    expect(out).toContain('(no summary)');
  });

  it('json mode stringifies the result', async () => {
    writeConfig({ mcpServers: { fs: { command: 'npx', args: ['@scope/fs@1.0.0'] } } });
    mockCheck.mockResolvedValue({ source: 'network', malicious: [], other: [] });
    await expect(run(['check', '--path', dir, '--json'])).rejects.toThrow('exit:0');
    const parsed = JSON.parse(logOutput.join('\n'));
    expect(parsed.ok).toBe(true);
    expect(parsed.checked).toHaveLength(1);
  });
});

describe('mcp-guard cache clear action (cov544)', () => {
  it('clears the cache dir and exits 0', async () => {
    await expect(run(['cache', 'clear', '--path', dir])).rejects.toThrow('exit:0');
    expect(exitCode).toBe(0);
    expect(logOutput.join('\n')).toContain('Cleared');
    expect(existsSync(path.join(dir, '.harness', 'cache', 'osv'))).toBe(false);
  });
});
