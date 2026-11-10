import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  extractNpmPackages,
  guardExitCode,
  parseNpmSpec,
  runMcpGuardCheck,
} from '../../src/commands/mcp-guard';
import { ExitCode } from '../../src/utils/errors';

describe('parseNpmSpec', () => {
  it('parses bare package names', () => {
    expect(parseNpmSpec('foo')).toEqual({ npmName: 'foo' });
  });

  it('parses name@version', () => {
    expect(parseNpmSpec('foo@1.2.3')).toEqual({ npmName: 'foo', version: '1.2.3' });
  });

  it('parses scoped names without versions', () => {
    expect(parseNpmSpec('@scope/foo')).toEqual({ npmName: '@scope/foo' });
  });

  it('parses scoped names with versions', () => {
    expect(parseNpmSpec('@scope/foo@1.2.3')).toEqual({
      npmName: '@scope/foo',
      version: '1.2.3',
    });
  });

  it('returns null for empty input', () => {
    expect(parseNpmSpec('')).toBeNull();
  });
});

describe('extractNpmPackages', () => {
  it('returns empty for an empty config', () => {
    expect(extractNpmPackages({})).toEqual([]);
  });

  it('skips non-npx commands', () => {
    expect(
      extractNpmPackages({
        mcpServers: {
          harness: { command: 'harness', args: ['mcp'] },
          remote: { command: '/usr/bin/python', args: ['/tmp/srv.py'] },
        },
      })
    ).toEqual([]);
  });

  it('extracts npx-launched packages with optional flags', () => {
    const pkgs = extractNpmPackages({
      mcpServers: {
        fs: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem@1.0.0', '/tmp'],
        },
        notion: { command: 'npx', args: ['@notion-mcp/server'] },
      },
    });
    expect(pkgs).toEqual([
      { serverName: 'fs', npmName: '@modelcontextprotocol/server-filesystem', version: '1.0.0' },
      { serverName: 'notion', npmName: '@notion-mcp/server' },
    ]);
  });

  it('ignores entries without an npm-style spec', () => {
    expect(
      extractNpmPackages({
        mcpServers: {
          bare: { command: 'npx', args: ['--help'] },
        },
      })
    ).toEqual([]);
  });
});

describe('runMcpGuardCheck', () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mcp-guard-'));
  });

  afterEach(async () => {
    await fs.promises.rm(cwd, { recursive: true, force: true });
  });

  it('returns ok=true with no checked entries when .mcp.json is absent', async () => {
    const result = await runMcpGuardCheck({ cwd });
    expect(result.ok).toBe(true);
    expect(result.checked).toEqual([]);
  });

  it('flags a malicious package and sets ok=false', async () => {
    const configPath = path.join(cwd, '.mcp.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: { bad: { command: 'npx', args: ['-y', 'evil-pkg@2.1.0'] } },
      }),
      'utf-8'
    );
    const fetchFn = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ vulns: [{ id: 'MAL-2026-0042', summary: 'malicious' }] }),
      }) as unknown as Response) as unknown as typeof fetch;
    const result = await runMcpGuardCheck({ cwd, fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checked).toHaveLength(1);
    expect(result.checked[0]?.malicious[0]?.id).toBe('MAL-2026-0042');
  });

  it('returns ok=true when OSV reports no vulnerabilities', async () => {
    const configPath = path.join(cwd, '.mcp.json');
    await fs.promises.writeFile(
      configPath,
      JSON.stringify({ mcpServers: { fs: { command: 'npx', args: ['@scope/fs@1.0.0'] } } }),
      'utf-8'
    );
    const fetchFn = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ vulns: [] }),
      }) as unknown as Response) as unknown as typeof fetch;
    const result = await runMcpGuardCheck({ cwd, fetchFn });
    expect(result.ok).toBe(true);
    expect(result.checked).toHaveLength(1);
    expect(result.checked[0]?.malicious).toEqual([]);
  });

  // #2074: a present-but-unparseable .mcp.json verified NOTHING, so it must
  // abstain rather than read as the same clean pass as an absent file.
  it('abstains (not a clean pass) when .mcp.json exists but is malformed JSON', async () => {
    await fs.promises.writeFile(
      path.join(cwd, '.mcp.json'),
      '{ "mcpServers": { "x": { "command": "npx", "args": ["-y","left-pad"] }, } }',
      'utf-8'
    );
    let fetched = 0;
    const fetchFn = (async () => {
      fetched++;
      return { ok: true, status: 200, json: async () => ({ vulns: [] }) } as unknown as Response;
    }) as unknown as typeof fetch;
    const result = await runMcpGuardCheck({ cwd, fetchFn });
    expect(result.ok).toBe(false);
    expect(result.checked).toEqual([]);
    expect(result.abstained?.reason).toMatch(/could not be parsed/);
    expect(fetched).toBe(0);
  });

  // V8's JSON.parse messages quote a source snippet around the error, and
  // .mcp.json `env` blocks hold secrets: the reason must never echo it.
  it.each([
    '{"mcpServers":{"x":{"command":"npx","args":["a"],"env":{"TOKEN": SENTINEL-sk-test-123}}}}',
    '{"mcpServers":{"x":{"command":"npx","args":["a"],"env":{"TOKEN":"sk-test-SENTINEL123"},}}}',
  ])('never echoes .mcp.json content in the abstain reason (%#)', async (body) => {
    await fs.promises.writeFile(path.join(cwd, '.mcp.json'), body, 'utf-8');
    const result = await runMcpGuardCheck({ cwd });
    expect(JSON.stringify(result)).not.toContain('SENTINEL');
    expect(result.abstained?.reason).toMatch(/could not be parsed \(SyntaxError/);
  });

  it.each(['null', '[]', '"a string"', '42'])(
    'abstains when .mcp.json top level is not an object (%s)',
    async (body) => {
      await fs.promises.writeFile(path.join(cwd, '.mcp.json'), body, 'utf-8');
      const result = await runMcpGuardCheck({ cwd });
      expect(result.ok).toBe(false);
      expect(result.abstained?.reason).toMatch(/not a JSON object/);
    }
  );

  it('does not set abstained when .mcp.json is absent or valid', async () => {
    expect((await runMcpGuardCheck({ cwd })).abstained).toBeUndefined();
    await fs.promises.writeFile(path.join(cwd, '.mcp.json'), '{"mcpServers":{}}', 'utf-8');
    const result = await runMcpGuardCheck({ cwd });
    expect(result.ok).toBe(true);
    expect(result.abstained).toBeUndefined();
  });
});

describe('guardExitCode', () => {
  const clean = { ok: true, checked: [] };
  const malicious = { ok: false, checked: [] };
  const abstained = { ok: false, checked: [], abstained: { reason: 'x' } };

  it('exits 0 for a clean result regardless of --strict', () => {
    expect(guardExitCode(clean, false)).toBe(ExitCode.SUCCESS);
    expect(guardExitCode(clean, true)).toBe(ExitCode.SUCCESS);
  });

  it('exits 2 when a malicious package is found regardless of --strict', () => {
    expect(guardExitCode(malicious, false)).toBe(2);
    expect(guardExitCode(malicious, true)).toBe(2);
  });

  it('fails open (0) on abstention by default, but exits ZERO_DENOMINATOR under --strict', () => {
    expect(guardExitCode(abstained, false)).toBe(ExitCode.SUCCESS);
    expect(guardExitCode(abstained, true)).toBe(ExitCode.ZERO_DENOMINATOR);
    expect(ExitCode.ZERO_DENOMINATOR).not.toBe(ExitCode.SUCCESS);
  });
});
